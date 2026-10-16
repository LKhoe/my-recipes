import { formatScaledQuantity } from "@/lib/scale";

export function formatIngredientLine(
  item: {
    quantity: number | null;
    unit: string | null;
    ingredientName: string;
    note: string | null;
  },
  /** Multiplies the stored quantity directly — e.g. 2 for "double this recipe" or 1.5 for "1.5x". */
  factor: number = 1,
): string {
  const quantity = item.quantity !== null && factor !== 1 ? item.quantity * factor : item.quantity;

  const parts = [formatScaledQuantity(quantity, item.unit), item.unit, item.ingredientName].filter(Boolean);
  const base = parts.join(" ");
  return item.note ? `${base} (${item.note})` : base;
}

/** A countdown as m:ss, or h:mm:ss from one hour up (so 90 minutes reads 1:30:00, not 90:00). */
export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
