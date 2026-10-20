import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recipe } from "@/lib/db/schema";
import { ImageValidationError } from "@/lib/services/image";
import { attachImageFromUrl, countRecipeImages, storeUploadedImage } from "@/lib/services/recipe-image";
import { MAX_PHOTOS_PER_RECIPE } from "@/lib/image-constants";

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

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      // Used right after an import (SPEC §4.6) to grab the source page/video's photo
      // automatically, without a manual upload step.
      const { imageUrl, external } = await request.json();
      if (typeof imageUrl !== "string") {
        return NextResponse.json({ error: "imageUrl é obrigatório." }, { status: 400 });
      }
      const created = await attachImageFromUrl(recipeId, imageUrl, { external: Boolean(external) });
      return NextResponse.json(created);
    }

    const count = await countRecipeImages(recipeId);
    if (count >= MAX_PHOTOS_PER_RECIPE) {
      return NextResponse.json(
        { error: `Uma receita pode ter no máximo ${MAX_PHOTOS_PER_RECIPE} fotos.` },
        { status: 400 },
      );
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Nenhum arquivo fornecido." }, { status: 400 });
    }
    const created = await storeUploadedImage(recipeId, Buffer.from(await file.arrayBuffer()), file.type, count);
    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Image upload failed:", err);
    return NextResponse.json({ error: "Falha ao enviar a imagem." }, { status: 500 });
  }
}
