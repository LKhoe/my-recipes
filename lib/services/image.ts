import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/image-constants";

const MAX_DIMENSION = 1600;
const THUMBNAIL_DIMENSION = 400;

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export class ImageValidationError extends Error {}

function thumbnailPathFor(relativePath: string): string {
  const ext = path.extname(relativePath);
  return relativePath.slice(0, -ext.length) + "-thumb" + ext;
}

export async function processAndStoreImage(
  recipeId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ path: string }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ImageValidationError(`Unsupported image type: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError("Image exceeds the 10 MB upload limit.");
  }

  const relativePath = path.posix.join("recipes", recipeId, `${randomUUID()}.webp`);
  const relativeThumbPath = thumbnailPathFor(relativePath);
  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  const absoluteThumbPath = path.join(UPLOADS_DIR, relativeThumbPath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  const image = sharp(buffer, { failOn: "none" }).rotate();

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
