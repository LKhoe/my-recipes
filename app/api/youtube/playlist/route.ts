import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, isNotNull, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recipe } from "@/lib/db/schema";
import { listQueuedVideoIds } from "@/lib/services/import-queue";
import { fetchPlaylist, YouTubePlaylistError } from "@/lib/services/youtube";
import { parseYouTubePlaylistId, parseYouTubeVideoId } from "@/lib/youtube-utils";

/** Video ids that already have a recipe in the collection (by anyone in the circle). */
async function importedVideoIds(): Promise<Set<string>> {
  const rows = await db
    .select({ videoUrl: recipe.videoUrl })
    .from(recipe)
    .where(and(isNull(recipe.deletedAt), isNotNull(recipe.videoUrl)));
  return new Set(rows.map((r) => (r.videoUrl ? parseYouTubeVideoId(r.videoUrl) : null)).filter((id) => id !== null));
}

/** A playlist's videos for the import picker, each flagged if it's already a recipe or queued. */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const playlistId = parseYouTubePlaylistId(request.nextUrl.searchParams.get("url") ?? "");
  if (!playlistId) {
    return NextResponse.json({ error: "Esse link não é de uma playlist do YouTube." }, { status: 400 });
  }

  try {
    const [playlist, imported, queued] = await Promise.all([
      fetchPlaylist(playlistId),
      importedVideoIds(),
      listQueuedVideoIds(session.user.id),
    ]);
    return NextResponse.json({
      ...playlist,
      videos: playlist.videos.map((v) => ({
        ...v,
        alreadyImported: imported.has(v.videoId),
        queued: queued.has(v.videoId),
      })),
    });
  } catch (err) {
    if (err instanceof YouTubePlaylistError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Playlist fetch failed:", err);
    return NextResponse.json({ error: "Não foi possível carregar a playlist." }, { status: 500 });
  }
}
