import path from "path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipeImage } from "@/lib/db/schema";
import { ImageValidationError, processAndStoreImage } from "@/lib/services/image";
import { ALLOWED_EXTERNAL_IMAGE_HOSTS, MAX_PHOTOS_PER_RECIPE } from "@/lib/image-constants";

export type StoredRecipeImage = { id: string; path: string; order: number };

const REMOTE_IMAGE_TIMEOUT_MS = 15_000;
// Some sites refuse requests without a browser-like User-Agent (403) or hotlinks without a Referer.
const REMOTE_IMAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; MyRecipesBot/1.0) recipe-import",
  Accept: "image/webp,image/jpeg,image/png,image/*;q=0.8",
};

export async function countRecipeImages(recipeId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipeImage)
    .where(eq(recipeImage.recipeId, recipeId));
  return count;
}

async function insertImage(recipeId: string, storedPath: string, order: number): Promise<StoredRecipeImage> {
  const [created] = await db
    .insert(recipeImage)
    .values({ recipeId, path: storedPath, order })
    .returning({ id: recipeImage.id, path: recipeImage.path, order: recipeImage.order });
  return created;
}

/** The real type of a downloaded image, from its first bytes: servers often send a wrong or generic one. */
export function sniffImageType(buffer: Buffer, declared: string): string {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return declared === "image/jpg" ? "image/jpeg" : declared;
}

export async function storeUploadedImage(recipeId: string, buffer: Buffer, mimeType: string, order: number) {
  const { path: storedPath } = await processAndStoreImage(path.posix.join("recipes", recipeId), buffer, mimeType);
  return insertImage(recipeId, storedPath, order);
}

/**
 * An import's photo, attached right after the recipe is created (SPEC §4.6). A YouTube thumbnail
 * (`external`) is stored as its own URL (DECISIONS.md "Fix: YouTube import uses the video
 * thumbnail URL directly"), restricted to YouTube's CDN so this can't attach an arbitrary URL. A
 * webpage's photo is downloaded and re-hosted, since the source may go offline or block hotlinking.
 * Throws ImageValidationError when the URL is unusable or the download isn't an image.
 */
export async function attachImageFromUrl(
  recipeId: string,
  imageUrl: string,
  opts: { external: boolean },
): Promise<StoredRecipeImage> {
  const count = await countRecipeImages(recipeId);
  if (count >= MAX_PHOTOS_PER_RECIPE) {
    throw new ImageValidationError(`Uma receita pode ter no máximo ${MAX_PHOTOS_PER_RECIPE} fotos.`);
  }

  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new ImageValidationError("URL de imagem inválida.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImageValidationError("URL de imagem inválida.");
  }

  if (opts.external) {
    if (!ALLOWED_EXTERNAL_IMAGE_HOSTS.includes(url.hostname)) {
      throw new ImageValidationError("Host de imagem externa não permitido.");
    }
    return insertImage(recipeId, imageUrl, count);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...REMOTE_IMAGE_HEADERS, Referer: `${url.origin}/` },
      redirect: "follow",
      signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS),
    });
  } catch {
    throw new ImageValidationError("Não foi possível buscar essa URL de imagem.");
  }
  if (!res.ok) {
    throw new ImageValidationError("Não foi possível buscar essa URL de imagem.");
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const declared = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  return storeUploadedImage(recipeId, buffer, sniffImageType(buffer, declared), count);
}
