import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./youtube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./youtube")>()),
  fetchPlaylist: vi.fn(),
}));

import { db } from "@/lib/db";
import { importBatch, importBatchItem, user } from "@/lib/db/schema";
import { addPlaylist, deletePlaylist, getPlaylist, listPlaylists, refreshPlaylist, setVideoIgnored } from "./playlist";
import { createRecipe } from "./recipe";
import { fetchPlaylist } from "./youtube";

// Integration test against the real database, like import-queue.test.ts. YouTube is mocked.
describe("saved playlists", () => {
  const stamp = Date.now();
  // 11-character video ids unique to this run: whether a video is imported is read from every recipe.
  const vid = (n: number) => `${String(stamp).slice(-9)}p${n}`;
  const video = (n: number) => ({ videoId: vid(n), title: `VÍDEO ${n} | Canal`, thumbnailUrl: null });
  const youtube = (videos: number[]) =>
    vi.mocked(fetchPlaylist).mockResolvedValueOnce({ playlistId: "PLtest", title: "Bolos", videos: videos.map(video) });
  let userId: string;

  beforeAll(async () => {
    const [created] = await db
      .insert(user)
      .values({ email: `playlist-${stamp}@example.com`, name: "Playlist Test" })
      .returning({ id: user.id });
    userId = created.id;
  });

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("orders videos as not imported (queued first), imported, failed, ignored, and picks up new ones on refresh", async () => {
    youtube([1, 2, 3, 4, 5]);
    const { id, existed } = await addPlaylist(userId, "PLtest");
    expect(existed).toBe(false);
    // Registering it again doesn't read YouTube or add a second one.
    expect(await addPlaylist(userId, "PLtest")).toEqual({ id, existed: true });
    expect(fetchPlaylist).toHaveBeenCalledTimes(1);

    const watch = `https://www.youtube.com/watch?v=${vid(2)}`;
    const { id: recipeId } = await createRecipe(userId, {
      title: "Bolo de fubá",
      description: null,
      servings: null,
      prepTime: null,
      cookTime: null,
      steps: [{ text: "Asse." }],
      ingredients: [],
      categoryIds: [],
      tags: [],
      sourceUrl: watch,
      videoUrl: watch,
    });
    // Written straight to the table, not queued: import-queue.test.ts, running alongside, drains
    // and cancels every pending video. It leaves failed ones, and only claims pending ones.
    const [batch] = await db.insert(importBatch).values({ userId, title: "Bolos", tier: "medium" }).returning();
    await db.insert(importBatchItem).values([
      { batchId: batch.id, ...video(3), position: 0, status: "failed", error: "resposta inválida" },
      { batchId: batch.id, ...video(4), position: 1, status: "running" },
    ]);
    expect(await setVideoIgnored(userId, id, vid(1), true)).toBe(true);

    const playlist = await getPlaylist(userId, id);
    expect(playlist!.videos.map((v) => [v.videoId, v.status])).toEqual([
      [vid(4), "queued"],
      [vid(5), "new"],
      [vid(2), "imported"],
      [vid(3), "failed"],
      [vid(1), "ignored"],
    ]);
    expect(playlist!.videos.find((v) => v.status === "imported")!.recipe).toMatchObject({ id: recipeId });
    expect(playlist!.videos.find((v) => v.status === "failed")!.error).toBe("resposta inválida");
    expect(playlist!.videos.find((v) => v.status === "queued")!.running).toBe(true);
    expect(playlist!.videos.some((v) => v.isNew)).toBe(false);

    const [summary] = (await listPlaylists(userId)).filter((p) => p.id === id);
    expect(summary.counts).toEqual({ new: 1, queued: 1, imported: 1, failed: 1, ignored: 1 });

    // 6 was added at the end of the playlist: it comes first among the not imported, marked new.
    youtube([5, 1, 2, 3, 4, 6]);
    expect(await refreshPlaylist(userId, id)).toEqual({ added: 1 });
    const refreshed = await getPlaylist(userId, id);
    expect(refreshed!.videos.map((v) => [v.videoId, v.status, v.isNew])).toEqual([
      [vid(4), "queued", false],
      [vid(6), "new", true],
      [vid(5), "new", false],
      [vid(2), "imported", false],
      [vid(3), "failed", false],
      [vid(1), "ignored", false],
    ]);

    // 5 was taken out of the playlist; nothing new, so 6 isn't new anymore. 1 stays ignored.
    youtube([1, 2, 3, 4, 6]);
    expect(await refreshPlaylist(userId, id)).toEqual({ added: 0 });
    const again = await getPlaylist(userId, id);
    expect(again!.videos.map((v) => [v.videoId, v.status, v.isNew])).toEqual([
      [vid(4), "queued", false],
      [vid(6), "new", false],
      [vid(2), "imported", false],
      [vid(3), "failed", false],
      [vid(1), "ignored", false],
    ]);
  });

  it("keeps each user's playlists to themselves", async () => {
    const [other] = await db
      .insert(user)
      .values({ email: `playlist-other-${stamp}@example.com`, name: "Outro" })
      .returning({ id: user.id });
    try {
      youtube([7]);
      const { id } = await addPlaylist(other.id, "PLother");
      expect(await getPlaylist(userId, id)).toBeNull();
      expect(await refreshPlaylist(userId, id)).toBeNull();
      expect(await setVideoIgnored(userId, id, vid(7), true)).toBe(false);
      expect(await deletePlaylist(userId, id)).toBe(false);
      expect(await deletePlaylist(other.id, id)).toBe(true);
    } finally {
      await db.delete(user).where(eq(user.id, other.id));
    }
  });
});
