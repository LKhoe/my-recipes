import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// lib/db/seed.ts and scripts/seed.mjs both run their seed immediately on import (including a
// process.exit in seed.ts) — see DECISIONS.md "Smaller hardening items" for why the category
// list is duplicated across a TS/JS boundary rather than shared. That means this test can't just
// `import` either file to compare arrays without triggering a real DB write and killing the test
// runner; instead it extracts each file's `CATEGORIES` array straight out of its source text
// (the array is plain JSON — double-quoted strings only — so this is a safe, exact parse, not a
// loose regex guess).
function extractCategoriesArray(relativePath: string): string[] {
  const source = readFileSync(path.join(process.cwd(), relativePath), "utf-8");
  const match = source.match(/const CATEGORIES = (\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error(`Could not find a "const CATEGORIES = [...]" array in ${relativePath}`);
  }
  // Trailing commas are valid in a JS array literal but not in strict JSON.
  const withoutTrailingComma = match[1].replace(/,(\s*\])/, "$1");
  return JSON.parse(withoutTrailingComma);
}

describe("category seed list", () => {
  it("lib/db/seed.ts and scripts/seed.mjs stay in sync", () => {
    const tsList = extractCategoriesArray("lib/db/seed.ts");
    const mjsList = extractCategoriesArray("scripts/seed.mjs");
    expect(mjsList).toEqual(tsList);
  });
});
