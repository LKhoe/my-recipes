// Ingredient sections ("Massa", "Recheio") for multi-part recipes. A recipe's ingredients stay one
// flat ordered list; each row carries an optional `group` label and a section is a run of
// consecutive rows with the same label. Rows with no label render with no heading, so recipes
// saved before sections existed look exactly as they did.

// Headings that only restate the list itself ("Ingredientes:") rather than name a part of the dish.
const GENERIC_LABELS = new Set(["ingredientes", "ingrediente", "ingredients", "ingredient"]);

/**
 * Cleans a section label from an import or the editor: "CALDO:" -> "Caldo", "Para o recheio" ->
 * "Recheio", "Ingredientes:" -> null. Mixed-case labels keep their case apart from the first letter,
 * so proper nouns survive ("Molho Bechamel" stays as is).
 */
export function normalizeGroupLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let label = raw
    .trim()
    .replace(/^[\s\-–—•*#:]+|[\s\-–—•*#:.]+$/g, "")
    .replace(/^para\s+(?:o|a|os|as)\s+/i, "")
    .trim();
  if (!label || GENERIC_LABELS.has(label.toLocaleLowerCase("pt-BR"))) return null;

  const letters = label.match(/\p{L}/gu) ?? [];
  const capitals = label.match(/\p{Lu}/gu) ?? [];
  if (letters.length >= 2 && capitals.length / letters.length >= 0.7) {
    label = label.toLocaleLowerCase("pt-BR");
  }
  return label.replace(/\p{L}/u, (first) => first.toLocaleUpperCase("pt-BR"));
}

export type IngredientSection<T> = {
  /** null for rows with no heading (a flat recipe is one section with group null). */
  group: string | null;
  /** Each row with its index in the original flat list, so editors can patch it in place. */
  rows: { item: T; index: number }[];
};

/** Splits the flat list into runs of consecutive rows sharing the same `group` (compared as is). */
export function groupIngredientSections<T extends { group?: string | null }>(items: T[]): IngredientSection<T>[] {
  const sections: IngredientSection<T>[] = [];
  items.forEach((item, index) => {
    const group = item.group ?? null;
    const last = sections.at(-1);
    if (last && last.group === group) {
      last.rows.push({ item, index });
    } else {
      sections.push({ group, rows: [{ item, index }] });
    }
  });
  return sections;
}
