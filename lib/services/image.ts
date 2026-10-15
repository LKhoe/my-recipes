import { randomUUID } from "crypto";
import path from "path";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/image-constants";
import { isExternalImageUrl, thumbnailPath } from "@/lib/image-url";
import { deleteObjects, putObject } from "@/lib/services/storage";

const MAX_DIMENSION = 1600;
// Sized for a recipe card at 2x DPR (cards are ≤ ~400 CSS px wide). Was 400 until the cards
// started using thumbnails — scripts/upload-photos-to-s3.mjs upgrades older ones while moving
// them into the bucket. Keep in sync with that script.
const THUMBNAIL_DIMENSION = 800;

export class ImageValidationError extends Error {}

/** Validates an upload and renders the stored webp + its thumbnail. No storage involved. */
export async function processImage(buffer: Buffer, mimeType: string): Promise<{ full: Buffer; thumb: Buffer }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ImageValidationError(`Tipo de imagem não suportado: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError("A imagem excede o limite de 10 MB por envio.");
  }

  // sharp's prebuilt binaries bundle libheif but not a licensed HEVC decoder, so a real iPhone
  // .heic photo fails there — pre-convert through heic-convert (a WASM libheif build that does
  // include HEVC decoding) to a JPEG buffer first, then hand that to the same sharp pipeline
  // below. See DECISIONS.md "HEIC upload support" — verified against a real HEVC-encoded file.
  let sourceBuffer: Buffer = buffer;
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    try {
      const converted = await heicConvert({ buffer, format: "JPEG", quality: 0.92 });
      sourceBuffer = Buffer.from(converted);
    } catch {
      throw new ImageValidationError(
        "Não foi possível processar esta foto HEIC/HEIF. Tente convertê-la para JPEG antes de enviar.",
      );
    }
  }

  const image = sharp(sourceBuffer, { failOn: "none" }).rotate();

  const [full, thumb] = await Promise.all([
    image
      .clone()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
    image
      .clone()
      .resize({ width: THUMBNAIL_DIMENSION, height: THUMBNAIL_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer(),
  ]);

  return { full, thumb };
}

/**
 * @param relativeDir Key prefix in the photo bucket, e.g. `recipes/{recipeId}` for a recipe's
 *   own cover photos or `recipes/{recipeId}/cooked` for a circle member's "I made this" photo —
 *   kept in a distinct prefix so the two collections don't mix.
 */
export async function processAndStoreImage(
  relativeDir: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ path: string }> {
  const { full, thumb } = await processImage(buffer, mimeType);

  const relativePath = path.posix.join(relativeDir, `${randomUUID()}.webp`);
  await Promise.all([
    putObject(relativePath, full, "image/webp"),
    putObject(thumbnailPath(relativePath), thumb, "image/webp"),
  ]);

  return { path: relativePath };
}

export async function deleteImageFiles(relativePath: string): Promise<void> {
  // A YouTube-thumbnail image (see processAndStoreImage's callers) stores the remote URL
  // directly rather than an object of ours — nothing to remove.
  if (isExternalImageUrl(relativePath)) return;

  await deleteObjects([relativePath, thumbnailPath(relativePath)]);
}
