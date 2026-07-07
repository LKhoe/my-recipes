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
