import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { deleteCookPhoto } from "@/lib/services/cook-photo";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { photoId } = await params;
  const deleted = await deleteCookPhoto(photoId, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Foto não encontrada, ou você não é quem a enviou." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
