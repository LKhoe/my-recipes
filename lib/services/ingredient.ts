import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingredient } from "@/lib/db/schema";

const IRREGULAR_SINGULARS: Record<string, string> = {
  leaves: "leaf",
  knives: "knife",
  loaves: "loaf",
  halves: "half",
  shelves: "shelf",
};

function singularizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR_SINGULARS[lower]) return IRREGULAR_SINGULARS[lower];

  if (lower.endsWith("ies") && lower.length > 3) return lower.slice(0, -3) + "y";
  if (lower.endsWith("oes") && lower.length > 3) return lower.slice(0, -2);
  if (lower.endsWith("ves") && lower.length > 3) return lower.slice(0, -3) + "f";
  if (
    lower.endsWith("s") &&
    !lower.endsWith("ss") &&
    !lower.endsWith("us") &&
    !lower.endsWith("as") &&
    lower.length > 3
  ) {
    return lower.slice(0, -1);
  }
  return lower;
}

// SPEC §4.5a: "normalize the name (lowercase, trim, singularize)". Only the last word is
// singularized so multi-word names like "chicken breasts" canonicalize as "chicken breast"
// rather than mangling earlier words. Hyphens count as spaces, so "pimenta-do-reino" and
// "pimenta do reino" are one ingredient.
export function normalizeIngredientName(raw: string): string {
  const collapsed = raw.replace(/-/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
  const words = collapsed.split(" ");
  words[words.length - 1] = singularizeWord(words[words.length - 1]);
  return words.join(" ");
}

export async function findOrCreateIngredient(rawName: string): Promise<{ id: string; name: string }> {
  const name = normalizeIngredientName(rawName);

  const [existing] = await db.select().from(ingredient).where(eq(ingredient.name, name)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(ingredient)
    .values({ name })
    .onConflictDoNothing({ target: ingredient.name })
    .returning();
  if (created) return created;

  // Lost the race to a concurrent insert — the row exists now, fetch it.
  const [row] = await db.select().from(ingredient).where(eq(ingredient.name, name)).limit(1);
  return row;
}
