import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recipe } from "@/lib/db/schema";
import { addCookPhoto, listCookPhotos } from "@/lib/services/cook-photo";
import { ImageValidationError } from "@/lib/services/image";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: recipeId } = await params;
  const photos = await listCookPhotos(recipeId);
  return NextResponse.json(photos);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: recipeId } = await params;

  const [existingRecipe] = await db.select({ id: recipe.id }).from(recipe).where(eq(recipe.id, recipeId)).limit(1);
  if (!existingRecipe) {
    return NextResponse.json({ error: "Receita não encontrada" }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo fornecido." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const created = await addCookPhoto(recipeId, session.user.id, buffer, file.type);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Cook photo upload failed:", err);
    return NextResponse.json({ error: "Falha ao enviar a foto." }, { status: 500 });
  }
}
