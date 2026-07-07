import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recipe, recipeImage } from "@/lib/db/schema";
import { ImageValidationError, processAndStoreImage } from "@/lib/services/image";
import { ALLOWED_EXTERNAL_IMAGE_HOSTS, MAX_PHOTOS_PER_RECIPE } from "@/lib/image-constants";

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

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipeImage)
    .where(eq(recipeImage.recipeId, recipeId));

  if (count >= MAX_PHOTOS_PER_RECIPE) {
    return NextResponse.json(
      { error: `Uma receita pode ter no máximo ${MAX_PHOTOS_PER_RECIPE} fotos.` },
      { status: 400 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    let buffer: Buffer;
    let mimeType: string;

    if (contentType.includes("application/json")) {
      // Used right after an import (SPEC §4.6) to grab the source page/video's photo
      // automatically, without a manual upload step.
      const { imageUrl, external } = await request.json();
      if (typeof imageUrl !== "string") {
        return NextResponse.json({ error: "imageUrl é obrigatório." }, { status: 400 });
      }

      if (external) {
        // A YouTube import (see DECISIONS.md "Fix: YouTube import uses the video thumbnail URL
        // directly") — store the thumbnail's own URL as the image instead of downloading and
        // re-hosting it. Restricted to YouTube's thumbnail CDN so this passthrough can't be used
        // to attach an arbitrary external URL to a recipe.
        let hostname: string;
        try {
          hostname = new URL(imageUrl).hostname;
        } catch {
          return NextResponse.json({ error: "URL de imagem inválida." }, { status: 400 });
        }
        if (!ALLOWED_EXTERNAL_IMAGE_HOSTS.includes(hostname)) {
          return NextResponse.json({ error: "Host de imagem externa não permitido." }, { status: 400 });
        }

        const [created] = await db
          .insert(recipeImage)
          .values({ recipeId, path: imageUrl, order: count })
          .returning({ id: recipeImage.id, path: recipeImage.path, order: recipeImage.order });
        return NextResponse.json(created);
      }

      // Non-YouTube imports (a webpage's og:image/JSON-LD photo) still get downloaded and
      // re-hosted locally, since the source page's own image may go offline or block hotlinking.
      const remoteRes = await fetch(imageUrl);
      if (!remoteRes.ok) {
        return NextResponse.json({ error: "Não foi possível buscar essa URL de imagem." }, { status: 422 });
      }
      mimeType = remoteRes.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      buffer = Buffer.from(await remoteRes.arrayBuffer());
    } else {
      const formData = await request.formData().catch(() => null);
      const file = formData?.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "Nenhum arquivo fornecido." }, { status: 400 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type;
    }

    const { path: storedPath } = await processAndStoreImage(path.posix.join("recipes", recipeId), buffer, mimeType);

    const [created] = await db
      .insert(recipeImage)
      .values({ recipeId, path: storedPath, order: count })
      .returning({ id: recipeImage.id, path: recipeImage.path, order: recipeImage.order });

    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Image upload failed:", err);
    return NextResponse.json({ error: "Falha ao enviar a imagem." }, { status: 500 });
  }
}
