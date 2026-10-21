import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deletePlaylist, refreshPlaylist } from "@/lib/services/playlist";
import { YouTubePlaylistError } from "@/lib/services/youtube";

const bodySchema = z.object({ action: z.literal("refresh") });

/** refresh: read the playlist again from YouTube, to pick up the videos added since. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await refreshPlaylist(session.user.id, id);
    if (!result) {
      return NextResponse.json({ error: "Playlist não encontrada." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof YouTubePlaylistError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Playlist refresh failed:", err);
    return NextResponse.json({ error: "Não foi possível atualizar a playlist." }, { status: 500 });
  }
}

/** Removes the playlist from the user's list; recipes already imported from it stay. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await deletePlaylist(session.user.id, id))) {
    return NextResponse.json({ error: "Playlist não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
