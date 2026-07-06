import { formatScaledQuantity, scaleQuantity } from "@/lib/scale";

export function formatIngredientLine(
  item: {
    quantity: number | null;
    unit: string | null;
    ingredientName: string;
    note: string | null;
  },
  scale: { originalServings: number; targetServings: number } | null = null,
): string {
  const quantity =
    item.quantity !== null && scale && scale.originalServings !== scale.targetServings
      ? scaleQuantity(item.quantity, scale.originalServings, scale.targetServings)
      : item.quantity;

  const parts = [formatScaledQuantity(quantity, item.unit), item.unit, item.ingredientName].filter(Boolean);
  const base = parts.join(" ");
  return item.note ? `${base} (${item.note})` : base;
}
