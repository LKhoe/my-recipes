import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { markRecipeReviewed } from "@/lib/services/recipe";

/** Marks an imported recipe as reviewed. Only its author can. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const updated = await markRecipeReviewed(id, session.user.id);
  if (!updated) {
    return NextResponse.json(
      { error: "Receita não encontrada, ou você não é quem a enviou." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
