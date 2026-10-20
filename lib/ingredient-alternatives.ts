// "Or" options on an ingredient ("100 g manteiga ou margarina", "1 xíc leite ou 1 xíc água").
// Like sections (lib/ingredient-groups.ts), the list stays flat: a row with `alternative: true` is
// an option for the nearest row above it that isn't one, within the same section. A flagged row
// with nothing to attach to (first row, or first of its section) counts as a plain ingredient.

type AlternativeRow = { alternative?: boolean; group?: string | null };

export type IngredientChoice<T> = {
  primary: { item: T; index: number };
  alternatives: { item: T; index: number }[];
};

/** Folds each run of alternative rows into the row above them. Expects rows of one section. */
export function groupAlternatives<T extends AlternativeRow>(rows: { item: T; index: number }[]): IngredientChoice<T>[] {
  const choices: IngredientChoice<T>[] = [];
  for (const row of rows) {
    const last = choices.at(-1);
    if (row.item.alternative && last) {
      last.alternatives.push(row);
    } else {
      choices.push({ primary: row, alternatives: [] });
    }
  }
  return choices;
}

/** Clears the flag where it can't apply (no row above it in the same section), before saving. */
export function cleanAlternativeFlags<T extends AlternativeRow>(items: T[]): T[] {
  return items.map((item, i) => {
    const above = items[i - 1];
    const valid = Boolean(item.alternative) && above !== undefined && (above.group ?? null) === (item.group ?? null);
    return { ...item, alternative: valid };
  });
}

/**
 * The shared amount is said once when the option has the same quantity and unit as the
 * ingredient it replaces: "100 g manteiga ou margarina", not "100 g manteiga ou 100 g margarina".
 */
export function sharesAmount(
  primary: { quantity: number | null; unit: string | null },
  alternative: { quantity: number | null; unit: string | null },
): boolean {
  return alternative.quantity === primary.quantity && (alternative.unit ?? null) === (primary.unit ?? null);
}
