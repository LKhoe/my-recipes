export function formatQuantity(quantity: number | null): string {
  if (quantity === null) return "";
  return Number(quantity.toFixed(2)).toString();
}

export function formatIngredientLine(item: {
  quantity: number | null;
  unit: string | null;
  ingredientName: string;
  note: string | null;
}): string {
  const parts = [formatQuantity(item.quantity), item.unit, item.ingredientName].filter(Boolean);
  const base = parts.join(" ");
  return item.note ? `${base} (${item.note})` : base;
}
