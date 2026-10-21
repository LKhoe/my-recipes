// Saved YouTube playlists: recipe channels the user keeps coming back to. Registering one stores its
// videos; "Atualizar" reads the playlist again and picks up what was added since. Each video's
// status is worked out on every read from the recipes (by video id, any member's) and the user's
// import queue, so a video imported from the "Adicionar receita" page shows up as imported here too.

import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { importBatch, importBatchItem, youtubePlaylist, youtubePlaylistVideo } from "@/lib/db/schema";
import { mapRecipesBySource, type RecipeSourceMatch } from "@/lib/services/recipe";
import { fetchPlaylist, type PlaylistVideo } from "@/lib/services/youtube";
import { sourceKey } from "@/lib/source-url";
import { youTubeWatchUrl } from "@/lib/youtube-utils";

// A saved playlist is read in full on every refresh (50 videos per Data API call, 1 quota unit each).
export const MAX_SAVED_PLAYLIST_VIDEOS = 1000;

/**
 * `new`: not imported yet; `queued`: waiting or running in the import queue; `failed`: the last
 * import of it failed or found no recipe; `ignored`: marked "Ignorar" by the user.
 */
export type PlaylistVideoStatus = "new" | "queued" | "imported" | "failed" | "ignored";

// The order of the manage page: what's left to import first (what's importing now on top), what's
// done out of the way.
export const PLAYLIST_VIDEO_STATUS_ORDER: PlaylistVideoStatus[] = ["queued", "new", "imported", "failed", "ignored"];

export type SavedPlaylistVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  status: PlaylistVideoStatus;
  /** Found by the last refresh (not there when the playlist was registered or refreshed before). */
  isNew: boolean;
  /** The newest recipe made from this video, for `imported`. */
  recipe: RecipeSourceMatch | null;
  /** Why the last import didn't make a recipe, for `failed`. */
  error: string | null;
  /** Whether the queued video is the one being imported right now. */
  running: boolean;
};

export type SavedPlaylistSummary = {
  id: string;
  playlistId: string;
  title: string;
  refreshedAt: string;
  thumbnailUrl: string | null;
  counts: Record<PlaylistVideoStatus, number>;
};

export type SavedPlaylist = Omit<SavedPlaylistSummary, "counts" | "thumbnailUrl"> & { videos: SavedPlaylistVideo[] };

/** Stores the playlist's current videos: new ones are added, gone ones removed, the rest updated. */
async function syncVideos(id: string, videos: PlaylistVideo[], complete: boolean, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const existing = new Set(
      (
        await tx
          .select({ videoId: youtubePlaylistVideo.videoId })
          .from(youtubePlaylistVideo)
          .where(eq(youtubePlaylistVideo.playlistId, id))
      ).map((r) => r.videoId),
    );

    if (videos.length > 0) {
      await tx
        .insert(youtubePlaylistVideo)
        .values(
          videos.map((v, position) => ({
            playlistId: id,
            videoId: v.videoId,
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            position,
            addedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [youtubePlaylistVideo.playlistId, youtubePlaylistVideo.videoId],
          // Not `ignored` or `addedAt`: those are the user's and the first sighting's.
          set: {
            title: sql`excluded.title`,
            thumbnailUrl: sql`excluded.thumbnail_url`,
            position: sql`excluded.position`,
          },
        });
    }

    // A playlist longer than MAX_SAVED_PLAYLIST_VIDEOS was cut short: what's past the cut is still there.
    if (complete) {
      const kept = videos.map((v) => v.videoId);
      await tx
        .delete(youtubePlaylistVideo)
        .where(
          kept.length > 0
            ? and(eq(youtubePlaylistVideo.playlistId, id), notInArray(youtubePlaylistVideo.videoId, kept))
            : eq(youtubePlaylistVideo.playlistId, id),
        );
    }

    await tx.update(youtubePlaylist).set({ refreshedAt: now }).where(eq(youtubePlaylist.id, id));
    return videos.filter((v) => !existing.has(v.videoId)).length;
  });
}

async function readPlaylist(playlistId: string) {
  const playlist = await fetchPlaylist(playlistId, { maxVideos: MAX_SAVED_PLAYLIST_VIDEOS });
  return { ...playlist, complete: playlist.videos.length < MAX_SAVED_PLAYLIST_VIDEOS };
}

/**
 * Registers a playlist for the user and stores its videos. A playlist they already have isn't
 * added twice: its id comes back with `existed`. Throws YouTubePlaylistError when YouTube can't
 * give the playlist.
 */
export async function addPlaylist(userId: string, playlistId: string): Promise<{ id: string; existed: boolean }> {
  const [already] = await db
    .select({ id: youtubePlaylist.id })
    .from(youtubePlaylist)
    .where(and(eq(youtubePlaylist.userId, userId), eq(youtubePlaylist.playlistId, playlistId)));
  if (already) return { id: already.id, existed: true };

  const playlist = await readPlaylist(playlistId);
  const now = new Date();
  const [created] = await db
    .insert(youtubePlaylist)
    .values({ userId, playlistId, title: playlist.title || "Playlist do YouTube", createdAt: now, refreshedAt: now })
    .onConflictDoNothing()
    .returning({ id: youtubePlaylist.id });
  // Registered by a second request (a double click) in the meantime.
  if (!created) return addPlaylist(userId, playlistId);

  await syncVideos(created.id, playlist.videos, playlist.complete, now);
  return { id: created.id, existed: false };
}

/** Reads the playlist again from YouTube. Null when it isn't the user's; else how many videos are new. */
export async function refreshPlaylist(userId: string, id: string): Promise<{ added: number } | null> {
  const [saved] = await db
    .select({ playlistId: youtubePlaylist.playlistId })
    .from(youtubePlaylist)
    .where(and(eq(youtubePlaylist.id, id), eq(youtubePlaylist.userId, userId)));
  if (!saved) return null;

  const playlist = await readPlaylist(saved.playlistId);
  if (playlist.title) {
    await db.update(youtubePlaylist).set({ title: playlist.title }).where(eq(youtubePlaylist.id, id));
  }
  const added = await syncVideos(id, playlist.videos, playlist.complete, new Date());
  return { added };
}

export async function deletePlaylist(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(youtubePlaylist)
    .where(and(eq(youtubePlaylist.id, id), eq(youtubePlaylist.userId, userId)))
    .returning({ id: youtubePlaylist.id });
  return deleted.length > 0;
}

/** "Ignorar" / "Não ignorar" a video of one of the user's playlists. False if there's no such video. */
export async function setVideoIgnored(userId: string, id: string, videoId: string, ignored: boolean): Promise<boolean> {
  if (!(await ownsPlaylist(userId, id))) return false;
  const updated = await db
    .update(youtubePlaylistVideo)
    .set({ ignored })
    .where(and(eq(youtubePlaylistVideo.playlistId, id), eq(youtubePlaylistVideo.videoId, videoId)))
    .returning({ videoId: youtubePlaylistVideo.videoId });
  return updated.length > 0;
}

async function ownsPlaylist(userId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: youtubePlaylist.id })
    .from(youtubePlaylist)
    .where(and(eq(youtubePlaylist.id, id), eq(youtubePlaylist.userId, userId)));
  return Boolean(row);
}

type StoredVideo = {
  playlistId: string;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  position: number;
  ignored: boolean;
  addedAt: Date;
};

/** The user's latest import of each of these videos (not the "Buscar modo de preparo" ones). */
async function latestImports(userId: string, videoIds: string[]) {
  const latest = new Map<string, { status: string; error: string | null }>();
  if (videoIds.length === 0) return latest;
  const rows = await db
    .select({ videoId: importBatchItem.videoId, status: importBatchItem.status, error: importBatchItem.error })
    .from(importBatchItem)
    .innerJoin(importBatch, eq(importBatchItem.batchId, importBatch.id))
    .where(
      and(
        eq(importBatch.userId, userId),
        eq(importBatchItem.refillSteps, false),
        inArray(importBatchItem.videoId, [...new Set(videoIds)]),
      ),
    )
    .orderBy(desc(importBatchItem.createdAt));
  for (const row of rows) if (!latest.has(row.videoId)) latest.set(row.videoId, row);
  return latest;
}

type PlaylistTimes = { createdAt: Date; refreshedAt: Date };

/** Each stored video with its status. A recipe made from the video wins over everything else. */
async function withStatus(userId: string, videos: StoredVideo[], playlists: Map<string, PlaylistTimes>) {
  const [bySource, imports] = await Promise.all([
    mapRecipesBySource(),
    latestImports(
      userId,
      videos.map((v) => v.videoId),
    ),
  ]);

  return videos.map((v): { playlistId: string; position: number; video: SavedPlaylistVideo } => {
    const recipe = bySource.get(sourceKey(youTubeWatchUrl(v.videoId))!)?.[0] ?? null;
    const last = imports.get(v.videoId);
    const status: PlaylistVideoStatus = recipe
      ? "imported"
      : last && (last.status === "pending" || last.status === "running")
        ? "queued"
        : v.ignored
          ? "ignored"
          : last && (last.status === "failed" || last.status === "no_recipe")
            ? "failed"
            : "new";
    const times = playlists.get(v.playlistId);
    const video: SavedPlaylistVideo = {
      videoId: v.videoId,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      status,
      // Same timestamp as the last refresh, and that refresh wasn't the registration.
      isNew: Boolean(
        times && v.addedAt.getTime() === times.refreshedAt.getTime() && times.refreshedAt > times.createdAt,
      ),
      recipe,
      error: status === "failed" ? (last?.error ?? null) : null,
      running: status === "queued" && last?.status === "running",
    };
    return { playlistId: v.playlistId, position: v.position, video };
  });
}

function emptyCounts(): Record<PlaylistVideoStatus, number> {
  return { new: 0, queued: 0, imported: 0, failed: 0, ignored: 0 };
}

/** The user's playlists, newest first, with how many videos are in each status. */
export async function listPlaylists(userId: string): Promise<SavedPlaylistSummary[]> {
  const playlists = await db
    .select()
    .from(youtubePlaylist)
    .where(eq(youtubePlaylist.userId, userId))
    .orderBy(desc(youtubePlaylist.createdAt));
  if (playlists.length === 0) return [];

  const stored = await db
    .select()
    .from(youtubePlaylistVideo)
    .where(
      inArray(
        youtubePlaylistVideo.playlistId,
        playlists.map((p) => p.id),
      ),
    )
    .orderBy(asc(youtubePlaylistVideo.position));
  const videos = await withStatus(userId, stored, new Map(playlists.map((p) => [p.id, p])));

  return playlists.map((p) => {
    const own = videos.filter((v) => v.playlistId === p.id);
    const counts = emptyCounts();
    for (const { video } of own) counts[video.status]++;
    return {
      id: p.id,
      playlistId: p.playlistId,
      title: p.title,
      refreshedAt: p.refreshedAt.toISOString(),
      thumbnailUrl: own.find(({ video }) => video.thumbnailUrl)?.video.thumbnailUrl ?? null,
      counts,
    };
  });
}

/** One of the user's playlists, its videos ordered by status (PLAYLIST_VIDEO_STATUS_ORDER), then new first, then playlist order. */
export async function getPlaylist(userId: string, id: string): Promise<SavedPlaylist | null> {
  const [playlist] = await db
    .select()
    .from(youtubePlaylist)
    .where(and(eq(youtubePlaylist.id, id), eq(youtubePlaylist.userId, userId)));
  if (!playlist) return null;

  const stored = await db.select().from(youtubePlaylistVideo).where(eq(youtubePlaylistVideo.playlistId, id));
  const videos = await withStatus(userId, stored, new Map([[playlist.id, playlist]]));
  const rank = (s: PlaylistVideoStatus) => PLAYLIST_VIDEO_STATUS_ORDER.indexOf(s);
  // Within a status, what the last refresh found first: playlists usually grow at the end.
  videos.sort(
    (a, b) =>
      rank(a.video.status) - rank(b.video.status) ||
      Number(b.video.isNew) - Number(a.video.isNew) ||
      a.position - b.position,
  );

  return {
    id: playlist.id,
    playlistId: playlist.playlistId,
    title: playlist.title,
    refreshedAt: playlist.refreshedAt.toISOString(),
    videos: videos.map(({ video }) => video),
  };
}
