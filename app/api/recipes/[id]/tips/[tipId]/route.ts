import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { deleteTip } from "@/lib/services/tip";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tipId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { tipId } = await params;
  const deleted = await deleteTip(tipId, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Dica não encontrada, ou você não é quem a escreveu." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
