// Shared between server (lib/services/image.ts) and client components — must stay free of
// Node-only imports (sharp, fs) since client bundles pull this in directly.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_RECIPE = 6;
// HEIC/HEIF (real iPhone photos, H.265/HEVC-encoded) can't be decoded by sharp's prebuilt
// binaries — libheif is bundled but without a licensed HEVC decoder plugin. See DECISIONS.md
// "HEIC upload support": lib/services/image.ts pre-converts these to JPEG via heic-convert (a
// WASM libheif build that does include HEVC decoding) before handing the buffer to sharp.
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
