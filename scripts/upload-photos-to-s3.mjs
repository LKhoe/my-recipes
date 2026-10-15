import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// One-time move of the photos that used to live on disk (the old `uploads/` folder or the
// `uploads_data` volume) into the S3 bucket. Object keys are the files' paths relative to the
// folder — exactly what the DB stores in recipe_image.path / cook_photo.path — so no DB change.
//
// Idempotent: objects already in the bucket with the same size are skipped, so it can be re-run.
// Thumbnails smaller than THUMBNAIL_DIMENSION (they were 400px before the cards used them) are
// re-rendered from the original on the way. Local files are never modified or deleted.
//
//   npm run photos:upload -- <folder> [--dry-run]                 (S3_* from .env.local / env)
//
// Needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (+ S3_REGION).
const THUMBNAIL_DIMENSION = 800; // keep in sync with lib/services/image.ts
const IMAGE_EXT = /\.(webp|jpe?g|png)$/i;
const CONTENT_TYPES = { ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const folder = args.find((a) => !a.startsWith("--"));
if (!folder) {
  console.error("Usage: node scripts/upload-photos-to-s3.mjs <folder> [--dry-run]");
  process.exit(1);
}
const root = path.resolve(folder);

for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
  if (!process.env[name]) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
}
const Bucket = process.env.S3_BUCKET;
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "garage",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function* files(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.isFile() && IMAGE_EXT.test(entry.name)) yield full;
  }
}

/** Size of the object in the bucket, or null if it isn't there. */
async function remoteSize(Key) {
  try {
    return (await s3.send(new HeadObjectCommand({ Bucket, Key }))).ContentLength ?? 0;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

const thumbOf = (p) => p.replace(/(\.[^./]+)$/, "-thumb$1");
const longSide = ({ width = 0, height = 0 }) => Math.max(width, height);
const stats = { uploaded: 0, skipped: 0, thumbsUpgraded: 0, failed: 0 };

/** true when it was (or, in a dry run, would be) uploaded */
async function upload(key, body, ext) {
  if ((await remoteSize(key)) === body.length) {
    stats.skipped++;
    return false;
  }
  if (!dryRun) {
    await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: CONTENT_TYPES[ext.toLowerCase()] }));
  }
  stats.uploaded++;
  console.log(`  ${dryRun ? "would upload" : "uploaded"} ${key} (${Math.round(body.length / 1024)} KB)`);
  return true;
}

// Fails early (wrong endpoint/credentials/bucket) before walking anything.
await remoteSize("__connection-check__");

console.log(`${dryRun ? "[dry run] " : ""}${root} -> s3://${Bucket} at ${process.env.S3_ENDPOINT}`);
for await (const file of files(root)) {
  if (/-thumb\.[^./]+$/.test(file)) continue; // handled with its original
  const key = path.relative(root, file).split(path.sep).join("/");
  const ext = path.extname(file);
  try {
    const original = await fs.readFile(file);
    await upload(key, original, ext);

    const expected = Math.min(THUMBNAIL_DIMENSION, longSide(await sharp(original).metadata()));
    let thumb = await fs.readFile(thumbOf(file)).catch(() => null);
    const current = thumb ? longSide(await sharp(thumb).metadata()) : 0;
    const upgrade = current < expected;
    if (upgrade) {
      thumb = await sharp(original)
        .resize({ width: THUMBNAIL_DIMENSION, height: THUMBNAIL_DIMENSION, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    }
    if ((await upload(thumbOf(key), thumb, ext)) && upgrade) stats.thumbsUpgraded++;
  } catch (err) {
    stats.failed++;
    console.warn(`  ⚠️  ${key}: ${err.message}`);
  }
}

console.log(
  `✅ ${stats.uploaded} uploaded, ${stats.skipped} already there, ${stats.thumbsUpgraded} thumbnails upgraded` +
    (stats.failed ? `, ${stats.failed} FAILED` : ""),
);
process.exit(stats.failed ? 1 : 0);
