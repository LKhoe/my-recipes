import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/image-constants";
import { isExternalImageUrl } from "@/lib/image-url";

const MAX_DIMENSION = 1600;
const THUMBNAIL_DIMENSION = 400;

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export class ImageValidationError extends Error {}

function thumbnailPathFor(relativePath: string): string {
  const ext = path.extname(relativePath);
  return relativePath.slice(0, -ext.length) + "-thumb" + ext;
}

/**
 * @param relativeDir Where under `uploads/` to store this image, e.g. `recipes/{recipeId}` for a
 *   recipe's own cover photos or `recipes/{recipeId}/cooked` for a circle member's "I made this"
 *   photo — kept in a distinct subfolder so the two collections don't mix.
 */
export async function processAndStoreImage(
  relativeDir: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ path: string }> {
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

  const relativePath = path.posix.join(relativeDir, `${randomUUID()}.webp`);
  const relativeThumbPath = thumbnailPathFor(relativePath);
  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  const absoluteThumbPath = path.join(UPLOADS_DIR, relativeThumbPath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  const image = sharp(sourceBuffer, { failOn: "none" }).rotate();

  await image
    .clone()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(absolutePath);

  await image
    .clone()
    .resize({ width: THUMBNAIL_DIMENSION, height: THUMBNAIL_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(absoluteThumbPath);

  return { path: relativePath };
}

export async function deleteImageFiles(relativePath: string): Promise<void> {
  // A YouTube-thumbnail image (see processAndStoreImage's callers) stores the remote URL
  // directly rather than a local file — nothing to remove from disk.
  if (isExternalImageUrl(relativePath)) return;

  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  const absoluteThumbPath = path.join(UPLOADS_DIR, thumbnailPathFor(relativePath));
  await Promise.all([
    fs.rm(absolutePath, { force: true }),
    fs.rm(absoluteThumbPath, { force: true }),
  ]);
}

export function resolveUploadPath(segments: string[]): string | null {
  const relativePath = path.posix.join(...segments);
  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  if (!absolutePath.startsWith(UPLOADS_DIR + path.sep)) return null; // path traversal guard
  return absolutePath;
}
