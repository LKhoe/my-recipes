// Playlist imports: a queue of videos in Postgres (import_batch / import_batch_item), worked
// through one at a time by a loop inside the app's own process. See DECISIONS.md "Playlist import"
// for why this is a table and not Redis/BullMQ. The loop starts with the server
// (instrumentation.ts) and is woken whenever a batch is queued or retried; an item left `running`
// by a restart goes back to `pending` when the loop starts again.
//
// Videos start at least IMPORT_SPACING_MS apart: downloading captions back to back got the server's
// IP blocked by YouTube after ~12 videos. When captions are blocked anyway, the video goes back to
// the queue and the loop pauses (BLOCKED_CAPTIONS_PAUSE_MS) instead of saving a recipe without its
// method. The same queue also fills in the method of recipes saved without one (refillSteps items).

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { importBatch, importBatchItem, recipe } from "@/lib/db/schema";
import { ALLOWED_EXTERNAL_IMAGE_HOSTS } from "@/lib/image-constants";
import type { LLMTier } from "@/lib/llm-tiers";
import { recipeInputSchema } from "@/lib/validation";
import { cleanVideoTitle, parseYouTubeVideoId, youTubeWatchUrl } from "@/lib/youtube-utils";
import { PageFetchError } from "@/lib/services/html-fetch";
import { importRecipeFromUrl } from "@/lib/services/import";
import { LLMExtractionError, LLMLimitError } from "@/lib/services/llm";
import { createRecipe } from "@/lib/services/recipe";
import { attachImageFromUrl } from "@/lib/services/recipe-image";
import { CaptionsBlockedError } from "@/lib/services/youtube";
import type { RecipeDraft, RecipeInput } from "@/types";

export const MAX_BATCH_VIDEOS = 200;
// Only a fallback: a new or retried batch wakes the loop right away.
const IDLE_POLL_MS = 60_000;
// After a database error, so a database that is down isn't hammered.
const ERROR_BACKOFF_MS = 15_000;
// Between the starts of two videos; a 50-video playlist takes about an hour.
export const IMPORT_SPACING_MS = 75_000;
// After YouTube blocks the captions; such a block lasts hours, so the loop checks back now and then.
export const BLOCKED_CAPTIONS_PAUSE_MS = 30 * 60_000;

const NO_STEPS_ERROR = "O vídeo não trouxe o modo de preparo (nem na legenda nem na descrição).";

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
  /** Fills in the method of an existing recipe instead of creating one. */
  refillSteps: boolean;
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
      refillSteps: importBatchItem.refillSteps,
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
      .map(({ id, videoId, title, thumbnailUrl, status, error, recipeId, refillSteps }) => ({
        id,
        videoId,
        title,
        thumbnailUrl,
        status,
        error,
        recipeId,
        refillSteps,
      })),
  }));
}

/**
 * Queues "Buscar modo de preparo" for the user's own recipes that came from a YouTube video and
 * still have no method. Other recipes in `recipeIds` are skipped. Returns how many were queued.
 */
export async function queueStepsRefill(userId: string, recipeIds: string[], tier: LLMTier): Promise<number> {
  if (recipeIds.length === 0) return 0;
  const targets = (
    await db
      .select({ id: recipe.id, title: recipe.title, videoUrl: recipe.videoUrl })
      .from(recipe)
      .where(
        and(
          inArray(recipe.id, recipeIds.slice(0, MAX_BATCH_VIDEOS)),
          eq(recipe.authorId, userId),
          isNull(recipe.deletedAt),
          isNotNull(recipe.videoUrl),
          sql`jsonb_array_length(${recipe.steps}) = 0`,
        ),
      )
  ).flatMap((r) => {
    const videoId = r.videoUrl ? parseYouTubeVideoId(r.videoUrl) : null;
    return videoId ? [{ ...r, videoId }] : [];
  });
  if (targets.length === 0) return 0;

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatch)
      .values({ userId, title: "Modo de preparo", tier })
      .returning({ id: importBatch.id });
    await tx.insert(importBatchItem).values(
      targets.map((t, position) => ({
        batchId: batch.id,
        videoId: t.videoId,
        title: t.title,
        thumbnailUrl: `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`,
        position,
        recipeId: t.id,
        refillSteps: true,
      })),
    );
  });
  wakeImportWorker();
  return targets.length;
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

type ClaimedItem = {
  id: string;
  batchId: string;
  videoId: string;
  title: string;
  recipeId: string | null;
  refillSteps: boolean;
  userId: string;
  tier: LLMTier;
};

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
      recipeId: importBatchItem.recipeId,
      refillSteps: importBatchItem.refillSteps,
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

/** Creates a recipe from the video, pending its author's review. */
async function importNewRecipe(item: ClaimedItem, draft: RecipeDraft) {
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
  // Saved without a method it would only look done; failing it shows up in the popup instead.
  if (parsed.data.steps.length === 0) {
    await finishItem(item.id, "failed", { error: NO_STEPS_ERROR });
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
}

/** Fills in the method of an existing recipe; leaves it alone if someone wrote one meanwhile. */
async function refillRecipeSteps(item: ClaimedItem, draft: RecipeDraft) {
  const steps = draft.recipeFound ? draftToRecipeInput(draft, item.title).steps : [];
  if (steps.length === 0) {
    await finishItem(item.id, "failed", { error: NO_STEPS_ERROR, recipeId: item.recipeId });
    return;
  }
  await db
    .update(recipe)
    .set({ steps, updatedAt: new Date() })
    .where(and(eq(recipe.id, item.recipeId!), sql`jsonb_array_length(${recipe.steps}) = 0`));
  await finishItem(item.id, "done", { recipeId: item.recipeId });
}

async function processItem(item: ClaimedItem) {
  try {
    if (item.refillSteps && !item.recipeId) {
      await finishItem(item.id, "failed", { error: "A receita foi apagada." });
      return;
    }
    const draft = await importRecipeFromUrl(youTubeWatchUrl(item.videoId), {
      tier: item.tier,
      failOnBlockedCaptions: true,
    });
    if (item.refillSteps) await refillRecipeSteps(item, draft);
    else await importNewRecipe(item, draft);
  } catch (err) {
    if (err instanceof CaptionsBlockedError) {
      // Thrown before the LLM call, so nothing was spent: back to the queue, and wait.
      await db
        .update(importBatchItem)
        .set({ status: "pending", startedAt: null })
        .where(eq(importBatchItem.id, item.id));
      pauseImportQueue(BLOCKED_CAPTIONS_PAUSE_MS);
      console.warn(`[import-queue] captions blocked by YouTube; pausing for ${BLOCKED_CAPTIONS_PAUSE_MS / 60_000} min`);
      return;
    }
    const recipeId = item.refillSteps ? item.recipeId : null;
    if (err instanceof LLMLimitError) {
      // Every later video would hit the same limit: stop the batch, the user can retry it later.
      await finishItem(item.id, "failed", { error: err.message, recipeId });
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
      recipeId,
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

type WorkerState = {
  started: boolean;
  wake: (() => void) | null;
  /** Epoch ms until which no video starts (captions blocked). */
  pausedUntil: number | null;
  /** Epoch ms before which the next video doesn't start (IMPORT_SPACING_MS). */
  nextStartAt: number | null;
};

declare global {
  var importWorkerState: WorkerState | undefined;
}

// On globalThis: instrumentation.ts and the route handlers are separate bundles in one process.
const worker: WorkerState = (globalThis.importWorkerState ??= {
  started: false,
  wake: null,
  pausedUntil: null,
  nextStartAt: null,
});

export function pauseImportQueue(ms: number) {
  worker.pausedUntil = Date.now() + ms;
}

/** For the progress popup: when the queue resumes, if it's paused because captions are blocked. */
export function getImportQueuePause(): string | null {
  return worker.pausedUntil && worker.pausedUntil > Date.now() ? new Date(worker.pausedUntil).toISOString() : null;
}

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
        const wait = Math.max(worker.pausedUntil ?? 0, worker.nextStartAt ?? 0) - Date.now();
        if (wait > 0) {
          // A wake (new batch, retry) during the wait just re-checks it.
          await sleep(wait);
          continue;
        }
        const startedAt = Date.now();
        if (await runNextImport()) {
          worker.nextStartAt = startedAt + IMPORT_SPACING_MS;
          continue;
        }
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
