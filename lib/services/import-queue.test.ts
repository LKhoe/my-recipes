import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The test drives the queue step by step with runNextImport; marking the loop as already started
// keeps createImportBatch/retry from starting the real one alongside.
vi.hoisted(() => {
  globalThis.importWorkerState = { started: true, wake: null, pausedUntil: null, nextStartAt: null };
});

vi.mock("./import", () => ({ importRecipeFromUrl: vi.fn() }));
vi.mock("./recipe-image", () => ({ attachImageFromUrl: vi.fn() }));

import { db } from "@/lib/db";
import { importBatchItem, user } from "@/lib/db/schema";
import type { RecipeDraft } from "@/types";
import { importRecipeFromUrl } from "./import";
import { LLMExtractionError, LLMLimitError } from "./llm";
import { CaptionsBlockedError } from "./youtube";
import { attachImageFromUrl } from "./recipe-image";
import { createRecipe, getRecipeById } from "./recipe";
import {
  cancelImportBatch,
  createImportBatch,
  dismissImportBatch,
  getImportQueuePause,
  listImportBatches,
  queueStepsRefill,
  retryImportBatch,
  runNextImport,
} from "./import-queue";

// Integration test against the real database, like recipe.test.ts. The import itself is mocked:
// this is about the queue, not the extraction.
const draft: RecipeDraft = {
  recipeFound: true,
  title: "Bolo de fubá",
  description: null,
  servings: 8,
  prepTime: null,
  cookTime: 40,
  steps: [{ text: "Misture tudo." }, { text: "  " }],
  ingredients: [{ ingredientName: "fubá", quantity: 2, unit: "xíc", note: null }],
  sourceUrl: "https://www.youtube.com/watch?v=aaaaaaaaaa1",
  videoUrl: "https://www.youtube.com/watch?v=aaaaaaaaaa1",
  imageUrl: "https://i.ytimg.com/vi/aaaaaaaaaa1/maxresdefault.jpg",
};

const video = (n: number) => ({ videoId: `aaaaaaaaaa${n}`, title: `VÍDEO ${n} | Canal`, thumbnailUrl: null });

async function drain() {
  while (await runNextImport());
}

describe("playlist import queue", () => {
  const stamp = Date.now();
  let userId: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    globalThis.importWorkerState!.pausedUntil = null;
    vi.mocked(attachImageFromUrl).mockResolvedValue({ id: "img", path: "p", order: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Leftovers from another run would be picked up first.
    await db
      .update(importBatchItem)
      .set({ status: "cancelled" })
      .where(inArray(importBatchItem.status, ["pending", "running"]));
    if (!userId) {
      const [created] = await db
        .insert(user)
        .values({ email: `import-queue-${stamp}@example.com`, name: "Queue Test" })
        .returning({ id: user.id });
      userId = created.id;
    }
  });

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("imports each video in order as a recipe pending review, and reports every outcome", async () => {
    vi.mocked(importRecipeFromUrl)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, recipeFound: false })
      .mockRejectedValueOnce(new LLMExtractionError("resposta inválida"));

    const { id: batchId } = await createImportBatch(userId, {
      title: "Bolos",
      tier: "medium",
      videos: [video(1), video(2), video(3), video(1)],
    });
    await drain();

    expect(vi.mocked(importRecipeFromUrl).mock.calls.map((c) => c[0])).toEqual([
      "https://www.youtube.com/watch?v=aaaaaaaaaa1",
      "https://www.youtube.com/watch?v=aaaaaaaaaa2",
      "https://www.youtube.com/watch?v=aaaaaaaaaa3",
    ]);
    expect(vi.mocked(importRecipeFromUrl).mock.calls[0][1]).toEqual({ tier: "medium", failOnBlockedCaptions: true });

    const [batch] = (await listImportBatches(userId)).filter((b) => b.id === batchId);
    expect(batch.items.map((i) => i.status)).toEqual(["done", "no_recipe", "failed"]);
    expect(batch.items[2].error).toBe("resposta inválida");

    const recipe = await getRecipeById(batch.items[0].recipeId!);
    expect(recipe).toMatchObject({ title: "Bolo de fubá", reviewPending: true, authorId: userId });
    expect(recipe!.steps).toEqual([{ text: "Misture tudo." }]);
    expect(attachImageFromUrl).toHaveBeenCalledWith(recipe!.id, draft.imageUrl, { external: true });
  });

  it("stops the rest of the batch when the AI limit is reached, and retries it on request", async () => {
    vi.mocked(importRecipeFromUrl).mockRejectedValueOnce(new LLMLimitError("o limite de uso da IA foi atingido."));
    const { id: batchId } = await createImportBatch(userId, { title: null, tier: "simple", videos: [video(4), video(5)] });

    await drain();
    expect(importRecipeFromUrl).toHaveBeenCalledTimes(1);
    let [batch] = (await listImportBatches(userId)).filter((b) => b.id === batchId);
    expect(batch.items.map((i) => i.status)).toEqual(["failed", "failed"]);

    vi.mocked(importRecipeFromUrl).mockResolvedValue(draft);
    expect(await retryImportBatch(userId, batchId)).toBe(true);
    await drain();
    [batch] = (await listImportBatches(userId)).filter((b) => b.id === batchId);
    expect(batch.items.map((i) => i.status)).toEqual(["done", "done"]);
  });

  it("cancels what hasn't started, and closing a batch hides it", async () => {
    const { id: batchId } = await createImportBatch(userId, { title: null, tier: "simple", videos: [video(6), video(7)] });

    expect(await cancelImportBatch("someone-else", batchId)).toBe(false);
    expect(await cancelImportBatch(userId, batchId)).toBe(true);
    expect(await runNextImport()).toBe(false);

    const [batch] = (await listImportBatches(userId)).filter((b) => b.id === batchId);
    expect(batch.items.map((i) => i.status)).toEqual(["cancelled", "cancelled"]);

    expect(await dismissImportBatch(userId, batchId)).toBe(true);
    expect((await listImportBatches(userId)).some((b) => b.id === batchId)).toBe(false);
  });

  it("puts the video back and pauses when YouTube blocks the captions, instead of saving it", async () => {
    vi.mocked(importRecipeFromUrl).mockRejectedValueOnce(new CaptionsBlockedError("blocked"));
    const { id: batchId } = await createImportBatch(userId, { title: null, tier: "simple", videos: [video(8)] });

    expect(await runNextImport()).toBe(true);
    const [batch] = (await listImportBatches(userId)).filter((b) => b.id === batchId);
    expect(batch.items.map((i) => [i.status, i.recipeId])).toEqual([["pending", null]]);
    const pause = getImportQueuePause();
    expect(pause).not.toBeNull();
    expect(new Date(pause!).getTime() - Date.now()).toBeGreaterThan(25 * 60_000);
  });

  it("fails a video whose recipe comes without a method", async () => {
    vi.mocked(importRecipeFromUrl).mockResolvedValueOnce({ ...draft, steps: [] });
    const { id: batchId } = await createImportBatch(userId, { title: null, tier: "simple", videos: [video(9)] });

    await drain();
    const [batch] = (await listImportBatches(userId)).filter((b) => b.id === batchId);
    expect(batch.items[0]).toMatchObject({ status: "failed", recipeId: null });
    expect(batch.items[0].error).toMatch(/modo de preparo/);
  });

  it("fills in the method of the user's own video recipes that have none, without touching the rest", async () => {
    const base = { description: null, servings: null, prepTime: null, cookTime: null, categoryIds: [], tags: [] };
    const fromVideo = (n: number) => ({ sourceUrl: `https://www.youtube.com/watch?v=bbbbbbbbbb${n}`, videoUrl: `https://www.youtube.com/watch?v=bbbbbbbbbb${n}` });
    const ingredients = [{ ingredientName: "fubá", quantity: 2, unit: "xíc", note: null }];
    const { id: empty } = await createRecipe(userId, { ...base, ...fromVideo(1), title: "Meu bolo", steps: [], ingredients });
    const { id: withSteps } = await createRecipe(userId, { ...base, ...fromVideo(2), title: "Com passos", steps: [{ text: "Asse." }], ingredients: [] });
    const { id: noVideo } = await createRecipe(userId, { ...base, sourceUrl: null, videoUrl: null, title: "Manual", steps: [], ingredients: [] });
    const [other] = await db.insert(user).values({ email: `other-${stamp}@example.com`, name: "Outro" }).returning({ id: user.id });
    const { id: notMine } = await createRecipe(other.id, { ...base, ...fromVideo(3), title: "Do outro", steps: [], ingredients: [] });

    try {
      expect(await queueStepsRefill(userId, [empty, withSteps, noVideo, notMine], "medium")).toBe(1);
      vi.mocked(importRecipeFromUrl).mockResolvedValueOnce({ ...draft, title: "Outro título", steps: [{ text: "Misture." }, { text: "Asse." }] });
      await drain();

      expect(vi.mocked(importRecipeFromUrl).mock.calls[0][0]).toBe("https://www.youtube.com/watch?v=bbbbbbbbbb1");
      const recipe = await getRecipeById(empty);
      expect(recipe).toMatchObject({ title: "Meu bolo", steps: [{ text: "Misture." }, { text: "Asse." }] });
      expect(recipe!.ingredients.map((i) => i.ingredientName)).toEqual(["fubá"]);

      const item = (await listImportBatches(userId)).flatMap((b) => b.items).find((i) => i.recipeId === empty);
      expect(item).toMatchObject({ status: "done", refillSteps: true });
    } finally {
      await db.delete(user).where(eq(user.id, other.id));
    }
  });
});
