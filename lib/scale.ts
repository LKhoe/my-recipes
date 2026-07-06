// SPEC §4.3 — proportional scaling plus display formatting: fraction-friendly for countable
// units (1.33 eggs -> "1⅓ eggs"), practical rounding for weights/volumes (267 g, not 266.67 g).

export function scaleQuantity(quantity: number, originalServings: number, targetServings: number): number {
  if (originalServings <= 0) return quantity;
  return quantity * (targetServings / originalServings);
}

// Cooking units that are conventionally expressed as fractions (whole eggs, cloves of garlic,
// cups/tbsp/tsp measures) rather than decimals.
const FRACTION_FRIENDLY_UNITS = new Set([
  "cup",
  "tbsp",
  "tsp",
  "clove",
  "slice",
  "piece",
  "pinch",
  "dash",
  "bunch",
  "sprig",
  "stick",
]);

const COMMON_FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

function formatFractionFriendly(value: number): string {
  const whole = Math.floor(value);
  const frac = value - whole;

  if (frac < 1 / 16) return String(whole || 0);

  let best = COMMON_FRACTIONS[0];
  let bestDiff = Math.abs(frac - best[0]);
  for (const candidate of COMMON_FRACTIONS) {
    const diff = Math.abs(frac - candidate[0]);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  // Close enough to the next whole number that showing a fraction would be misleading.
  if (1 - frac < 1 / 16) return String(whole + 1);

  return whole > 0 ? `${whole}${best[1]}` : best[1];
}

function formatPracticalRounding(value: number): string {
  const rounded = value >= 10 ? Math.round(value) : Number(value.toFixed(1));
  return rounded.toString();
}

/** Formats a (possibly scaled) quantity for display, per unit conventions described above. */
export function formatScaledQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return "";
  if (unit === null || FRACTION_FRIENDLY_UNITS.has(unit)) return formatFractionFriendly(quantity);
  return formatPracticalRounding(quantity);
}
