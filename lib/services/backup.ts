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
/**
 * Better Auth tables whose rows are credentials: live session tokens, password hashes and OAuth
 * access/refresh/id tokens, one-time verification tokens. Any circle member can download a backup
 * (SPEC §4.9), so their DATA never goes into it; the table definitions stay so a restore works.
 * After a restore people sign in with Google again (Better Auth re-creates the `account` row by
 * linking to the existing user with the same email, see DECISIONS.md "S8").
 */
export const BACKUP_EXCLUDED_TABLE_DATA = ["public.session", "public.account", "public.verification"] as const;

/**
 * Connection settings for the child as PG* variables, so the password never shows up in `ps`
 * (argv is visible to every process in the container). Pure, for tests.
 */
export function pgEnvFromUrl(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  const env: Record<string, string> = {};
  if (url.hostname) env.PGHOST = decodeURIComponent(url.hostname.replace(/^\[|\]$/g, ""));
  if (url.port) env.PGPORT = url.port;
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (database) env.PGDATABASE = database;
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

export function pgDumpArgs(): string[] {
  return ["-Fc", ...BACKUP_EXCLUDED_TABLE_DATA.map((t) => `--exclude-table-data=${t}`)];
}

function collectPgDump(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      reject(new Error("DATABASE_URL is not configured."));
      return;
    }

    let pgEnv: Record<string, string>;
    try {
      pgEnv = pgEnvFromUrl(databaseUrl);
    } catch {
      reject(new Error("DATABASE_URL is not a valid URL."));
      return;
    }

    // Only PATH plus the PG* settings: the child doesn't need (and shouldn't inherit) the app's secrets.
    const child = spawn("pg_dump", pgDumpArgs(), {
      env: { PATH: process.env.PATH ?? "", ...pgEnv } as unknown as NodeJS.ProcessEnv,
    });
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

// tar-stream 3.2 ships its own types but does not export the entry() argument type
type HeaderArg = Partial<tar.Header> & Pick<tar.Header, 'name'>;

function writeEntry(pack: tar.Pack, header: HeaderArg, content: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    pack.entry(header, content, (err) => (err ? reject(err) : resolve()));
  });
}

function streamEntry(pack: tar.Pack, header: HeaderArg, source: Readable): Promise<void> {
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
