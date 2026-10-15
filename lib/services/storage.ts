import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Recipe photos live in an S3 bucket on LocalInfra's Garage (see DEPLOY.md), keyed by the same
// relative path the DB stores in `recipe_image.path` / `cook_photo.path`, e.g.
// `recipes/{recipeId}/{uuid}.webp`. The bucket is never public: /api/uploads streams objects to
// signed-in users.

declare global {
  var s3Client: S3Client | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured (photo storage, see .env.example).`);
  return value;
}

function bucket(): string {
  return requireEnv("S3_BUCKET");
}

function client(): S3Client {
  globalThis.s3Client ??= new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION || "garage",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
    // Garage serves buckets by path (http://localinfra-s3:3900/<bucket>/<key>), not by subdomain.
    forcePathStyle: true,
    // The SDK's default extra CRC checksums are an AWS addition other S3 servers may not all
    // accept; only send them when an operation requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return globalThis.s3Client;
}

/** Rejects keys that could escape the uploads namespace when they come from a URL. */
export function isSafeObjectKey(key: string): boolean {
  return key.length > 0 && !key.startsWith("/") && !key.split("/").some((s) => s === "" || s === "." || s === "..");
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

/** `null` when the object doesn't exist. */
export async function getObjectStream(
  key: string,
): Promise<{ body: ReadableStream; contentLength?: number; contentType?: string } | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentLength: res.ContentLength,
      contentType: res.ContentType,
    };
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

/** Deleting a key that doesn't exist is not an error (S3 semantics). */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await client().send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}

export async function* listObjects(prefix = ""): AsyncGenerator<{ key: string; size: number }> {
  let ContinuationToken: string | undefined;
  do {
    const page = await client().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) yield { key: obj.Key, size: obj.Size ?? 0 };
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
}

/** Cheap reachability + credentials check for /api/health. */
export async function checkBucket(): Promise<void> {
  await client().send(new HeadBucketCommand({ Bucket: bucket() }));
}
