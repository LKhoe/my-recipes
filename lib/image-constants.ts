// Shared between server (lib/services/image.ts) and client components — must stay free of
// Node-only imports (sharp, fs) since client bundles pull this in directly.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_RECIPE = 6;
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
