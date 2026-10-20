// Playlist imports: a queue of videos in Postgres (import_batch / import_batch_item), worked
// through one at a time by a loop inside the app's own process. See DECISIONS.md "Playlist import"
// for why this is a table and not Redis/BullMQ. The loop starts with the server
// (instrumentation.ts) and is woken whenever a batch is queued or retried; an item left `running`
// by a restart goes back to `pending` when the loop starts again.

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { importBatch, importBatchItem } from "@/lib/db/schema";
import { ALLOWED_EXTERNAL_IMAGE_HOSTS } from "@/lib/image-constants";
import type { LLMTier } from "@/lib/llm-tiers";
import { recipeInputSchema } from "@/lib/validation";
import { cleanVideoTitle, youTubeWatchUrl } from "@/lib/youtube-utils";
import { PageFetchError } from "@/lib/services/html-fetch";
import { importRecipeFromUrl } from "@/lib/services/import";
import { LLMExtractionError, LLMLimitError } from "@/lib/services/llm";
import { createRecipe } from "@/lib/services/recipe";
import { attachImageFromUrl } from "@/lib/services/recipe-image";
import type { RecipeDraft, RecipeInput } from "@/types";

export const MAX_BATCH_VIDEOS = 200;
// Only a fallback: a new or retried batch wakes the loop right away.
const IDLE_POLL_MS = 60_000;
// After a database error, so a database that is down isn't hammered.
const ERROR_BACKOFF_MS = 15_000;

export type ImportItemStatus = (typeof importBatchItem.status.enumValues)[number];
const FINISHED_STATUSES: ImportItemStatus[] = ["done", "no_recipe", "failed", "cancelled"];

export type ImportBatchItemView = {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  status: ImportItemStatus;
  error: string | null;
  recipeId: string | null;
};

export type ImportBatchView = {
  id: string;
  title: string | null;
  createdAt: string;
  items: ImportBatchItemView[];
};

// ---------------------------------------------------------------------------
// Batches (called from the API routes)
// ---------------------------------------------------------------------------

export async function createImportBatch(
  userId: string,
  input: { title: string | null; tier: LLMTier; videos: { videoId: string; title: string; thumbnailUrl: string | null }[] },
): Promise<{ id: string }> {
  const seen = new Set<string>();
  const videos = input.videos.filter((v) => !seen.has(v.videoId) && seen.add(v.videoId)).slice(0, MAX_BATCH_VIDEOS);

  const created = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatch)
      .values({ userId, title: input.title, tier: input.tier })
      .returning({ id: importBatch.id });
    await tx.insert(importBatchItem).values(
      videos.map((v, position) => ({
        batchId: batch.id,
        videoId: v.videoId,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        position,
      })),
    );
    return batch;
  });

  wakeImportWorker();
  return created;
}

/** The user's batches still shown in the progress popup (not closed yet), newest first. */
export async function listImportBatches(userId: string): Promise<ImportBatchView[]> {
  const batches = await db
    .select({ id: importBatch.id, title: importBatch.title, createdAt: importBatch.createdAt })
    .from(importBatch)
    .where(and(eq(importBatch.userId, userId), isNull(importBatch.dismissedAt)))
    .orderBy(desc(importBatch.createdAt))
    .limit(10);
  if (batches.length === 0) return [];

  const items = await db
    .select({
      id: importBatchItem.id,
      batchId: importBatchItem.batchId,
      videoId: importBatchItem.videoId,
      title: importBatchItem.title,
      thumbnailUrl: importBatchItem.thumbnailUrl,
      status: importBatchItem.status,
      error: importBatchItem.error,
      recipeId: importBatchItem.recipeId,
    })
    .from(importBatchItem)
    .where(
      inArray(
        importBatchItem.batchId,
        batches.map((b) => b.id),
      ),
    )
    .orderBy(asc(importBatchItem.position));

  return batches.map((batch) => ({
    id: batch.id,
    title: batch.title,
    createdAt: batch.createdAt.toISOString(),
    items: items
      .filter((i) => i.batchId === batch.id)
      .map(({ id, videoId, title, thumbnailUrl, status, error, recipeId }) => ({
        id,
        videoId,
        title,
        thumbnailUrl,
        status,
        error,
        recipeId,
      })),
  }));
}

/** Video ids the user already has waiting or running in a batch, so the picker can flag them. */
export async function listQueuedVideoIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ videoId: importBatchItem.videoId })
    .from(importBatchItem)
    .innerJoin(importBatch, eq(importBatchItem.batchId, importBatch.id))
    .where(and(eq(importBatch.userId, userId), inArray(importBatchItem.status, ["pending", "running"])));
  return new Set(rows.map((r) => r.videoId));
}

async function ownsBatch(userId: string, batchId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: importBatch.id })
    .from(importBatch)
    .where(and(eq(importBatch.id, batchId), eq(importBatch.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function cancelPendingItems(batchId: string) {
  await db
    .update(importBatchItem)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(importBatchItem.batchId, batchId), eq(importBatchItem.status, "pending")));
}

/** Drops the videos that haven't started; the one running now still finishes. */
export async function cancelImportBatch(userId: string, batchId: string): Promise<boolean> {
  if (!(await ownsBatch(userId, batchId))) return false;
  await cancelPendingItems(batchId);
  return true;
}

/** Queues the failed and cancelled videos of a batch again. */
export async function retryImportBatch(userId: string, batchId: string): Promise<boolean> {
  if (!(await ownsBatch(userId, batchId))) return false;
  await db
    .update(importBatchItem)
    .set({ status: "pending", error: null, startedAt: null, finishedAt: null })
    .where(and(eq(importBatchItem.batchId, batchId), inArray(importBatchItem.status, ["failed", "cancelled"])));
  wakeImportWorker();
  return true;
}

/** Hides a batch from the popup (closing it also drops whatever hadn't started). */
export async function dismissImportBatch(userId: string, batchId: string): Promise<boolean> {
  if (!(await ownsBatch(userId, batchId))) return false;
  await cancelPendingItems(batchId);
  await db.update(importBatch).set({ dismissedAt: new Date() }).where(eq(importBatch.id, batchId));
  return true;
}

export function isFinished(status: ImportItemStatus): boolean {
  return FINISHED_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

type ClaimedItem = { id: string; batchId: string; videoId: string; title: string; userId: string; tier: LLMTier };

/** Takes the oldest pending video. SKIP LOCKED keeps two loops (e.g. an overlapping deploy) apart. */
async function claimNextItem(): Promise<ClaimedItem | null> {
  const next = db
    .select({ id: importBatchItem.id })
    .from(importBatchItem)
    .where(eq(importBatchItem.status, "pending"))
    .orderBy(asc(importBatchItem.createdAt), asc(importBatchItem.position))
    .limit(1)
    .for("update", { skipLocked: true });

  const [claimed] = await db
    .update(importBatchItem)
    .set({ status: "running", startedAt: new Date() })
    // `= (subquery)`, not `IN (subquery)`: Postgres may run an IN subquery once per row, and with
    // SKIP LOCKED each run returns the next row, claiming several videos at once.
    .where(sql`${importBatchItem.id} = (${next})`)
    .returning({
      id: importBatchItem.id,
      batchId: importBatchItem.batchId,
      videoId: importBatchItem.videoId,
      title: importBatchItem.title,
    });
  if (!claimed) return null;

  const [batch] = await db
    .select({ userId: importBatch.userId, tier: importBatch.tier })
    .from(importBatch)
    .where(eq(importBatch.id, claimed.batchId));
  return { ...claimed, userId: batch.userId, tier: batch.tier as LLMTier };
}

async function finishItem(
  id: string,
  status: ImportItemStatus,
  fields: { error?: string | null; recipeId?: string | null } = {},
) {
  await db
    .update(importBatchItem)
    .set({ status, error: fields.error ?? null, recipeId: fields.recipeId ?? null, finishedAt: new Date() })
    .where(eq(importBatchItem.id, id));
}

/** A draft as a saveable recipe; the same limits the form's API route checks. */
export function draftToRecipeInput(draft: RecipeDraft, videoTitle: string): RecipeInput {
  const wholeOrNull = (n: number | null, min: number) => (n != null && Number.isFinite(n) && n >= min ? Math.round(n) : null);
  return {
    title: (draft.title.trim() || cleanVideoTitle(videoTitle) || "Receita sem título").slice(0, 200),
    description: draft.description?.trim().slice(0, 4000) || null,
    servings: wholeOrNull(draft.servings, 1),
    prepTime: wholeOrNull(draft.prepTime, 0),
    cookTime: wholeOrNull(draft.cookTime, 0),
    steps: draft.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ ...s, text: s.text.trim(), durationMinutes: s.durationMinutes ? Math.round(s.durationMinutes) : undefined })),
    ingredients: draft.ingredients
      .filter((i) => i.ingredientName.trim())
      .map((i) => ({ ...i, quantity: i.quantity != null && i.quantity >= 0 ? i.quantity : null })),
    categoryIds: [],
    tags: [],
    sourceUrl: draft.sourceUrl,
    videoUrl: draft.videoUrl,
  };
}

function isExternalImage(url: string): boolean {
  try {
    return ALLOWED_EXTERNAL_IMAGE_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function processItem(item: ClaimedItem) {
  try {
    const draft = await importRecipeFromUrl(youTubeWatchUrl(item.videoId), { tier: item.tier });
    if (!draft.recipeFound) {
      await finishItem(item.id, "no_recipe", { error: "Não encontramos uma receita neste vídeo." });
      return;
    }

    const parsed = recipeInputSchema.safeParse(draftToRecipeInput(draft, item.title));
    if (!parsed.success) {
      console.warn(`[import-queue] ${item.videoId}: draft didn't validate:`, parsed.error.message);
      await finishItem(item.id, "failed", { error: "A receita extraída veio incompleta." });
      return;
    }

    // Imported recipes wait for their author's review (see ReviewPendingNotice).
    const { id: recipeId } = await createRecipe(item.userId, parsed.data, { reviewPending: true });
    if (draft.imageUrl) {
      await attachImageFromUrl(recipeId, draft.imageUrl, { external: isExternalImage(draft.imageUrl) }).catch((err) =>
        console.warn(`[import-queue] ${item.videoId}: photo not attached:`, (err as Error).message),
      );
    }
    await finishItem(item.id, "done", { recipeId });
  } catch (err) {
    if (err instanceof LLMLimitError) {
      // Every later video would hit the same limit: stop the batch, the user can retry it later.
      await finishItem(item.id, "failed", { error: err.message });
      await db
        .update(importBatchItem)
        .set({ status: "failed", error: err.message, finishedAt: new Date() })
        .where(and(eq(importBatchItem.batchId, item.batchId), eq(importBatchItem.status, "pending")));
      return;
    }
    const known = err instanceof LLMExtractionError || err instanceof PageFetchError;
    if (!known) console.error(`[import-queue] ${item.videoId}: import failed:`, err);
    else console.warn(`[import-queue] ${item.videoId}: import failed:`, (err as Error).message);
    await finishItem(item.id, "failed", {
      error: known ? (err as Error).message : "A importação falhou inesperadamente.",
    });
  }
}

/** Imports the oldest pending video, if any. One step of the loop; false when the queue is empty. */
export async function runNextImport(): Promise<boolean> {
  const item = await claimNextItem();
  if (!item) return false;
  await processItem(item);
  return true;
}

type WorkerState = { started: boolean; wake: (() => void) | null };

declare global {
  var importWorkerState: WorkerState | undefined;
}

// On globalThis: instrumentation.ts and the route handlers are separate bundles in one process.
const worker: WorkerState = (globalThis.importWorkerState ??= { started: false, wake: null });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      worker.wake = null;
      resolve();
    }
    worker.wake = done;
  });
}

/** Starts the loop once per process. Safe to call again. */
export function startImportWorker() {
  if (worker.started) return;
  worker.started = true;

  void (async () => {
    // A restart mid-import left these behind; nothing is working on them now.
    let recovered = false;
    for (;;) {
      try {
        if (!recovered) {
          await db.update(importBatchItem).set({ status: "pending", startedAt: null }).where(eq(importBatchItem.status, "running"));
          recovered = true;
        }
        if (await runNextImport()) continue;
        await sleep(IDLE_POLL_MS);
      } catch (err) {
        console.error("[import-queue] worker error:", err);
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  })();
}

export function wakeImportWorker() {
  startImportWorker();
  worker.wake?.();
}
