// Fails when lib/db/schema.ts has changes that no committed migration covers (someone forgot
// `npm run db:generate`). Works on a temp copy of the migrations folder, so it never writes to the
// repo, never touches a database, and runs with stdin closed + a timeout so a drizzle-kit prompt
// (e.g. "is this column renamed or new?") can't hang it: a prompt counts as drift.
//
//   npm run db:check
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(path.join(tmpdir(), "db-check-"));
const out = path.join(work, "migrations");
const list = () => readdirSync(out).filter((f) => f.endsWith(".sql")).sort();

try {
  cpSync(path.join(root, "lib/db/migrations"), out, { recursive: true });
  const before = list();
  const config = path.join(work, "drizzle.config.mjs");
  writeFileSync(
    config,
    `export default ${JSON.stringify({
      schema: path.join(root, "lib/db/schema.ts"),
      out: "./migrations", // drizzle-kit resolves `out` against the cwd, so run it from the temp dir
      dialect: "postgresql",
    })};\n`,
  );

  const res = spawnSync(process.execPath, [path.join(root, "node_modules/drizzle-kit/bin.cjs"), "generate", "--config", config], {
    cwd: work,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
    encoding: "utf8",
  });

  const added = list().filter((f) => !before.includes(f));
  if (res.error || res.status !== 0) {
    console.error(`db:check: drizzle-kit generate failed (status ${res.status}${res.error ? `, ${res.error.message}` : ""}).`);
    console.error((res.stdout + res.stderr).trim().slice(-1500));
    process.exitCode = 1;
  } else if (added.length > 0) {
    console.error(`db:check: schema.ts differs from the committed migrations (would generate ${added.join(", ")}). Run \`npm run db:generate\` and commit the result.`);
    process.exitCode = 1;
  } else if (!/No schema changes/i.test(res.stdout)) {
    // A prompt that can't be answered (stdin closed) crashes drizzle-kit without a migration file
    // and, depending on the version, without a failing exit code: only the explicit message counts.
    console.error("db:check: drizzle-kit did not report \"No schema changes\" (an interactive prompt, such as a rename question, is likely). Run `npm run db:generate` by hand.");
    console.error((res.stdout + res.stderr).trim().slice(-800));
    process.exitCode = 1;
  } else {
    console.log("db:check: migrations are up to date with schema.ts.");
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
