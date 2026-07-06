import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recipeImage } from "@/lib/db/schema";
import { deleteImageFiles } from "@/lib/services/image";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: recipeId, imageId } = await params;

  const [deleted] = await db
    .delete(recipeImage)
    .where(and(eq(recipeImage.id, imageId), eq(recipeImage.recipeId, recipeId)))
    .returning({ path: recipeImage.path });

  if (!deleted) {
    return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });
  }

  await deleteImageFiles(deleted.path);

  return NextResponse.json({ ok: true });
}
