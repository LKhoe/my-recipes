import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addPlaylist } from "@/lib/services/playlist";
import { YouTubePlaylistError } from "@/lib/services/youtube";
import { parseYouTubePlaylistId } from "@/lib/youtube-utils";

const bodySchema = z.object({ url: z.string().max(2000) });

/** Registers a YouTube playlist (by its link) and stores its videos. */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const playlistId = parsed.success ? parseYouTubePlaylistId(parsed.data.url.trim()) : null;
  if (!playlistId) {
    return NextResponse.json({ error: "Esse link não é de uma playlist do YouTube." }, { status: 400 });
  }

  try {
    const result = await addPlaylist(session.user.id, playlistId);
    return NextResponse.json(result, { status: result.existed ? 200 : 201 });
  } catch (err) {
    if (err instanceof YouTubePlaylistError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Saving playlist failed:", err);
    return NextResponse.json({ error: "Não foi possível cadastrar a playlist." }, { status: 500 });
  }
}
