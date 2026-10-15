// Shared between server and client — must stay free of Node-only imports (see lib/image-constants.ts).
const EXTERNAL_URL_PATTERN = /^https?:\/\//;

export function isExternalImageUrl(value: string): boolean {
  return EXTERNAL_URL_PATTERN.test(value);
}

/**
 * Resolves a stored `recipeImage.path` into a renderable `<img>`/`<Image>` src. Local uploads are
 * served through `/api/uploads/`, but a YouTube import (see DECISIONS.md "Fix: YouTube import
 * uses the video thumbnail URL directly") stores the video's thumbnail URL as-is instead of
 * downloading and re-hosting it — that URL is already renderable directly.
 */
export function imageSrc(path: string): string {
  return isExternalImageUrl(path) ? path : `/api/uploads/${path}`;
}

/** `recipes/abc/uuid.webp` → `recipes/abc/uuid-thumb.webp`, the small copy stored next to every upload. */
export function thumbnailPath(path: string): string {
  return path.replace(/(\.[^./]+)$/, "-thumb$1");
}

/**
 * Like `imageSrc`, but for grids/cards: the thumbnail (≤ 800px, see `THUMBNAIL_DIMENSION` in
 * lib/services/image.ts) instead of the 1600px original. External URLs have no thumbnail.
 */
export function thumbnailSrc(path: string): string {
  return isExternalImageUrl(path) ? path : `/api/uploads/${thumbnailPath(path)}`;
}
