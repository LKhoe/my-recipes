import { spawn } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { createGzip } from "zlib";
import tar from "tar-stream";
import { UPLOADS_DIR } from "@/lib/services/image";

// SPEC §4.9: `pg_dump -Fc` piped, together with the uploads directory, into one tar.gz. Tar
// entries need a known size up front, which a live process's stdout doesn't have — so the dump
// (typically small for this app's data) is buffered in memory once, while each upload file
// streams straight off disk (its size comes cheaply from `stat`, no buffering needed). Neither
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

async function* walkFiles(dir: string, base: string): AsyncGenerator<{ relativePath: string; absolutePath: string; size: number }> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return; // uploads/ may not exist yet on a fresh install
  }

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath, base);
    } else if (entry.isFile()) {
      const stat = await fsp.stat(absolutePath);
      yield { relativePath: path.relative(base, absolutePath), absolutePath, size: stat.size };
    }
  }
}

function writeEntry(pack: tar.Pack, header: tar.Headers, content: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    pack.entry(header, content, (err) => (err ? reject(err) : resolve()));
  });
}

function streamEntry(pack: tar.Pack, header: tar.Headers, sourcePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const entry = pack.entry(header, (err) => {
      if (err) reject(err);
    });
    if (!entry) {
      reject(new Error(`Could not create tar entry for ${header.name}`));
      return;
    }
    const readStream = fs.createReadStream(sourcePath);
    readStream.on("error", reject);
    entry.on("error", reject);
    entry.on("finish", resolve);
    readStream.pipe(entry);
  });
}

/**
 * Returns a gzip-compressed tar stream: `db.dump` at the root, plus everything under `uploads/`.
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

      for await (const file of walkFiles(UPLOADS_DIR, UPLOADS_DIR)) {
        await streamEntry(pack, { name: `uploads/${file.relativePath}`, size: file.size }, file.absolutePath);
      }

      pack.finalize();
    } catch (err) {
      pack.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return gzip;
}
