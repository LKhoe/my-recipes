import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listQueuedVideoIds } from "@/lib/services/import-queue";
import { mapRecipesBySource } from "@/lib/services/recipe";
import { fetchPlaylist, YouTubePlaylistError } from "@/lib/services/youtube";
import { sourceKey } from "@/lib/source-url";
import { parseYouTubePlaylistId, youTubeWatchUrl } from "@/lib/youtube-utils";

/** A playlist's videos for the import picker, each with the recipe already made from it, if any. */
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
    const [playlist, bySource, queued] = await Promise.all([
      fetchPlaylist(playlistId),
      mapRecipesBySource(),
      listQueuedVideoIds(session.user.id),
    ]);
    return NextResponse.json({
      ...playlist,
      videos: playlist.videos.map((v) => ({
        ...v,
        // The newest recipe made from this video (by any member), if any.
        existingRecipe: bySource.get(sourceKey(youTubeWatchUrl(v.videoId))!)?.[0] ?? null,
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
