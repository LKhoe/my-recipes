import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setVideoIgnored } from "@/lib/services/playlist";

const bodySchema = z.object({ ignored: z.boolean() });

/** "Ignorar" / "Não ignorar" a video of a saved playlist. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const { id, videoId } = await params;
  if (!(await setVideoIgnored(session.user.id, id, videoId, parsed.data.ignored))) {
    return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
