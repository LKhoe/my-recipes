import { spawn } from "child_process";
import { Readable } from "stream";
import type { ReadableStream as NodeWebReadableStream } from "stream/web";
import { createGzip } from "zlib";
import tar from "tar-stream";
import { getObjectStream, listObjects } from "@/lib/services/storage";

// SPEC §4.9: `pg_dump -Fc` piped, together with every photo in the bucket, into one tar.gz. Tar
// entries need a known size up front, which a live process's stdout doesn't have — so the dump
// (typically small for this app's data) is buffered in memory once, while each photo streams
// straight out of S3 (its size comes from the bucket listing, no buffering needed). Neither
// touches a temp file on disk, matching the spec's "no temp files" intent.
function collectPgDump(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      reject(new Error("DATABASE_URL is not configured."));
      return;
    }

    const child = spawn("pg_dump", ["-Fc", databaseUrl]);
    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

function writeEntry(pack: tar.Pack, header: tar.Headers, content: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    pack.entry(header, content, (err) => (err ? reject(err) : resolve()));
  });
}

function streamEntry(pack: tar.Pack, header: tar.Headers, source: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const entry = pack.entry(header, (err) => {
      if (err) reject(err);
    });
    if (!entry) {
      reject(new Error(`Could not create tar entry for ${header.name}`));
      return;
    }
    source.on("error", reject);
    entry.on("error", reject);
    entry.on("finish", resolve);
    source.pipe(entry);
  });
}

/**
 * Returns a gzip-compressed tar stream: `db.dump` at the root, plus every photo under `uploads/`.
 *
 * `pack`'s `error` is forwarded to `gzip` explicitly — plain `.pipe()` does not propagate `error`
 * events from source to destination, so a failed `pg_dump` would otherwise leave `gzip` (and the
 * HTTP response reading from it) hanging forever while `pack`'s unhandled error crashes the
 * process instead of surfacing anywhere useful.
 */
export function createBackupStream(): NodeJS.ReadableStream {
  const pack = tar.pack();
  const gzip = createGzip();
  pack.on("error", (err) => gzip.destroy(err));
  pack.pipe(gzip);

  (async () => {
    try {
      const dump = await collectPgDump();
      await writeEntry(pack, { name: "db.dump", size: dump.length }, dump);

      // Kept under `uploads/` so an archive restores the same way it did when photos were on disk.
      for await (const object of listObjects()) {
        const stored = await getObjectStream(object.key);
        if (!stored) continue; // deleted between the listing and now
        const source = Readable.fromWeb(stored.body as NodeWebReadableStream);
        await streamEntry(pack, { name: `uploads/${object.key}`, size: object.size }, source);
      }

      pack.finalize();
    } catch (err) {
      pack.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return gzip;
}
