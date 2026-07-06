// SPEC §4.5 — the shopping-list merge algorithm. A pure function so it's cheap to test
// exhaustively: group by canonical ingredient, then by unit within that ingredient. Same-unit
// quantities sum into one line; different units stay as separate lines but share the ingredient
// so the UI can group them under one heading. Notes (prep detail) aren't part of this — SPEC §5's
// `ShoppingListItem` has no `note` column, since prep guidance isn't relevant to buying groceries.

export type MergeInputItem = {
  ingredientId: string;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
};

export type MergedShoppingListLine = {
  ingredientId: string;
  ingredientName: string;
  unit: string | null;
  quantity: number | null;
};

export function mergeIngredientsForShoppingList(items: MergeInputItem[]): MergedShoppingListLine[] {
  const groupsByIngredient = new Map<string, { name: string; buckets: Map<string, MergeInputItem[]> }>();

  for (const item of items) {
    let group = groupsByIngredient.get(item.ingredientId);
    if (!group) {
      group = { name: item.ingredientName, buckets: new Map() };
      groupsByIngredient.set(item.ingredientId, group);
    }

    // Compatibility = exact same unit (already normalized to a canonical alias at ingest time).
    // A bare no-unit count (e.g. "3 eggs") is its own bucket, distinct from any real unit.
    const bucketKey = item.unit ?? "";
    const bucket = group.buckets.get(bucketKey);
    if (bucket) bucket.push(item);
    else group.buckets.set(bucketKey, [item]);
  }

  const lines: MergedShoppingListLine[] = [];

  for (const [ingredientId, group] of groupsByIngredient) {
    for (const [bucketKey, bucketItems] of group.buckets) {
      const quantities = bucketItems.map((i) => i.quantity).filter((q): q is number => q !== null);
      // All-unquantified (e.g. every recipe just said "salt, to taste") -> one line, no quantity.
      // Otherwise sum whatever quantities are given; an unquantified item alongside quantified
      // ones just doesn't add to the total (there's nothing to add).
      const quantity = quantities.length === 0 ? null : quantities.reduce((sum, q) => sum + q, 0);

      lines.push({
        ingredientId,
        ingredientName: group.name,
        unit: bucketKey === "" ? null : bucketKey,
        quantity,
      });
    }
  }

  lines.sort(
    (a, b) => a.ingredientName.localeCompare(b.ingredientName) || (a.unit ?? "").localeCompare(b.unit ?? ""),
  );

  return lines;
}
