// Deterministic parser for a raw ingredient line ("2 1/2 cups flour, sifted") into
// { quantity, unit, name, note }. Used by the JSON-LD import path (SPEC §4.6 step 1), which is
// explicitly a no-LLM, free, instant path — so this has to do the quantity/unit/name/note split
// (SPEC §4.5a) with regex/heuristics rather than a model call. It's inherently imperfect on
// unusual phrasing; the LLM paths (4.6 step 2, 4.6b) do their own splitting per-recipe instead.

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 1 / 4,
  "½": 1 / 2,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

// Ordered longest-first within each length so e.g. "tablespoons" matches before "tablespoon".
const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  mg: "mg",
  milligram: "mg",
  milligrams: "mg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  cl: "cl",
  dl: "dl",
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  clove: "clove",
  cloves: "clove",
  slice: "slice",
  slices: "slice",
  can: "can",
  cans: "can",
  piece: "piece",
  pieces: "piece",
  bunch: "bunch",
  bunches: "bunch",
  sprig: "sprig",
  sprigs: "sprig",
  stick: "stick",
  sticks: "stick",
  package: "package",
  packages: "package",
  pkg: "package",
};

export type ParsedIngredientLine = {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
};

function parseLeadingNumber(text: string): { value: number; rest: string } | null {
  // "2 1/2" or "1/2" or "2.5" or "2" or a unicode fraction, optionally followed by one.
  const mixedFraction = text.match(/^(\d+)\s+(\d+)\/(\d+)\s*/);
  if (mixedFraction) {
    const whole = Number(mixedFraction[1]);
    const num = Number(mixedFraction[2]);
    const den = Number(mixedFraction[3]);
    return { value: whole + num / den, rest: text.slice(mixedFraction[0].length) };
  }

  const simpleFraction = text.match(/^(\d+)\/(\d+)\s*/);
  if (simpleFraction) {
    const num = Number(simpleFraction[1]);
    const den = Number(simpleFraction[2]);
    return { value: num / den, rest: text.slice(simpleFraction[0].length) };
  }

  // A range like "2-3 apples" or "2 to 3 apples" — use the lower bound. Checked before the
  // plain-decimal case below since that would otherwise match just the "2" and leave a
  // dangling "-3" stuck to the front of the name.
  const range = text.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*\d+(?:\.\d+)?\s*/);
  if (range) {
    return { value: Number(range[1]), rest: text.slice(range[0].length) };
  }

  const decimal = text.match(/^(\d+(?:\.\d+)?)\s*/);
  if (decimal) {
    return { value: Number(decimal[1]), rest: text.slice(decimal[0].length) };
  }

  const unicodeFraction = text.match(/^(\d+)?([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/);
  if (unicodeFraction) {
    const whole = unicodeFraction[1] ? Number(unicodeFraction[1]) : 0;
    const frac = UNICODE_FRACTIONS[unicodeFraction[2]];
    return { value: whole + frac, rest: text.slice(unicodeFraction[0].length) };
  }

  return null;
}

function parseLeadingUnit(text: string): { unit: string; rest: string } | null {
  const match = text.match(/^([a-zA-Z]+)\.?\s+/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const canonical = UNIT_ALIASES[word];
  if (!canonical) return null;
  return { unit: canonical, rest: text.slice(match[0].length) };
}

/** Splits a name string on its first comma or trailing/leading parenthetical into name + note. */
function splitNameAndNote(text: string): { name: string; note: string | null } {
  const parenMatch = text.match(/\(([^)]+)\)/);
  let working = text;
  let note: string | null = null;

  if (parenMatch) {
    note = parenMatch[1].trim();
    working = (working.slice(0, parenMatch.index) + working.slice(parenMatch.index! + parenMatch[0].length)).trim();
  }

  const commaIndex = working.indexOf(",");
  if (commaIndex !== -1) {
    const afterComma = working.slice(commaIndex + 1).trim();
    working = working.slice(0, commaIndex).trim();
    note = note ? `${afterComma}; ${note}` : afterComma;
  }

  return { name: working.trim(), note };
}

export function parseIngredientLine(raw: string): ParsedIngredientLine {
  let text = raw.trim().replace(/\s+/g, " ");

  const parsedNumber = parseLeadingNumber(text);
  if (!parsedNumber) {
    const { name, note } = splitNameAndNote(text);
    return { quantity: null, unit: null, name, note };
  }

  text = parsedNumber.rest.trim();
  const parsedUnit = parseLeadingUnit(text);
  const unit = parsedUnit?.unit ?? null;
  if (parsedUnit) text = parsedUnit.rest.trim();

  const { name, note } = splitNameAndNote(text);
  return { quantity: parsedNumber.value, unit, name, note };
}
