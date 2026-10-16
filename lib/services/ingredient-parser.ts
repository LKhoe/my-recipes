// Deterministic parser for a raw ingredient line ("2 1/2 xíc farinha, peneirada") into
// { quantity, unit, name, note }. Used by the JSON-LD import path (SPEC §4.6 step 1), which is
// explicitly a no-LLM, free, instant path — so this has to do the quantity/unit/name/note split
// (SPEC §4.5a) with regex/heuristics rather than a model call. It's inherently imperfect on
// unusual phrasing; the LLM paths (4.6 step 2, 4.6b) do their own splitting per-recipe instead.
// UI display is Brazilian Portuguese (see DECISIONS.md "pt-BR translation"), but recipe.recipeIngredient
// text comes from arbitrary third-party sites via JSON-LD — many of which are English-language —
// so both English and Portuguese unit words are recognized here and normalized to the same
// canonical pt-BR token (e.g. "tbsp" and "colher de sopa" both -> "csp") for consistent display
// and shopping-list merging regardless of the source language.

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

// Both Portuguese and English unit words map onto the same canonical pt-BR token. Keys can be
// multi-word phrases ("colher de sopa", "tablespoon of") — see parseLeadingUnit, which tries
// phrases longest-first rather than a single word token.
const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  grama: "g",
  gramas: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  quilo: "kg",
  quilos: "kg",
  quilograma: "kg",
  quilogramas: "kg",
  kilogram: "kg",
  kilograms: "kg",
  mg: "mg",
  miligrama: "mg",
  miligramas: "mg",
  milligram: "mg",
  milligrams: "mg",
  ml: "ml",
  mililitro: "ml",
  mililitros: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  litro: "l",
  litros: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  cl: "cl",
  dl: "dl",
  "xíc": "xíc",
  xic: "xíc",
  "xícara": "xíc",
  xicara: "xíc",
  "xícaras": "xíc",
  xicaras: "xíc",
  cup: "xíc",
  cups: "xíc",
  csp: "csp",
  "colher de sopa": "csp",
  "colheres de sopa": "csp",
  "colher (sopa)": "csp",
  "colheres (sopa)": "csp",
  // Bare "colher(es)" with no "de sopa"/"de chá" qualifier is genuinely ambiguous, but Brazilian
  // recipes overwhelmingly mean tablespoon when unqualified (teaspoon is almost always spelled
  // out as "de chá") — see DECISIONS.md "Unit normalization at the service layer" for this call.
  colher: "csp",
  colheres: "csp",
  tbsp: "csp",
  tablespoon: "csp",
  tablespoons: "csp",
  // Colher de sobremesa (~10 ml) sits between the two; mapping it to either would halve or
  // double the amount when scaling.
  csb: "csb",
  "colher de sobremesa": "csb",
  "colheres de sobremesa": "csb",
  "colher (sobremesa)": "csb",
  "colheres (sobremesa)": "csb",
  dessertspoon: "csb",
  dessertspoons: "csb",
  cch: "cch",
  "colher de chá": "cch",
  "colher de cha": "cch",
  "colheres de chá": "cch",
  "colheres de cha": "cch",
  "colher (chá)": "cch",
  "colher (cha)": "cch",
  "colheres (chá)": "cch",
  "colheres (cha)": "cch",
  tsp: "cch",
  teaspoon: "cch",
  teaspoons: "cch",
  oz: "oz",
  "onça": "oz",
  onca: "oz",
  "onças": "oz",
  oncas: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  libra: "lb",
  libras: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  pitada: "pitada",
  pitadas: "pitada",
  pinch: "pitada",
  pinches: "pitada",
  borrifo: "borrifo",
  borrifos: "borrifo",
  dash: "borrifo",
  dashes: "borrifo",
  dente: "dente",
  dentes: "dente",
  clove: "dente",
  cloves: "dente",
  fatia: "fatia",
  fatias: "fatia",
  slice: "fatia",
  slices: "fatia",
  lata: "lata",
  latas: "lata",
  can: "lata",
  cans: "lata",
  unidade: "unidade",
  unidades: "unidade",
  piece: "unidade",
  pieces: "unidade",
  "maço": "maço",
  maco: "maço",
  "maços": "maço",
  macos: "maço",
  bunch: "maço",
  bunches: "maço",
  ramo: "ramo",
  ramos: "ramo",
  sprig: "ramo",
  sprigs: "ramo",
  tablete: "tablete",
  tabletes: "tablete",
  stick: "tablete",
  sticks: "tablete",
  pacote: "pacote",
  pacotes: "pacote",
  package: "pacote",
  packages: "pacote",
  pkg: "pacote",
};

// Longest phrase first, so "colher de sopa" is tried before a bare "colher" would (wrongly) match.
const UNIT_PHRASES = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length);

/**
 * Normalizes a standalone unit string (as opposed to `parseLeadingUnit`, which pulls a unit off
 * the front of a whole ingredient *line*) through the same alias table — an exact match after
 * trimming/lowercasing, not a prefix search. Used at the service layer (`lib/services/recipe.ts`)
 * so every save path (manual form, LLM extraction, JSON-LD import) ends up with the same
 * canonical token regardless of how the unit string arrived — see DECISIONS.md "Unit
 * normalization at the service layer".
 *
 * An unrecognized unit is stored as-typed (trimmed/lowercased), not rejected — SPEC doesn't
 * define a closed unit vocabulary, and rejecting an unusual-but-valid unit would block saving a
 * real recipe over a cosmetic mismatch.
 */
export function normalizeUnit(rawUnit: string | null | undefined): string | null {
  if (!rawUnit) return null;
  const trimmed = rawUnit.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  return UNIT_ALIASES[key] ?? key;
}

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

  // A range like "2-3 maçãs", "2 a 3 maçãs", or "2 to 3 apples" — use the lower bound. Checked
  // before the plain-decimal case below since that would otherwise match just the "2" and leave
  // a dangling "-3" stuck to the front of the name.
  const range = text.match(/^(\d+(?:\.\d+)?)\s*(?:-|a|to)\s*\d+(?:\.\d+)?\s*/);
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
  const lower = text.toLowerCase();

  for (const phrase of UNIT_PHRASES) {
    if (!lower.startsWith(phrase)) continue;

    let cursor = phrase.length;
    if (text[cursor] === ".") cursor += 1;

    // Whole-word/phrase match only — the next character must end the phrase (or the string),
    // not continue into a longer word (so "l" doesn't match the start of "laranja").
    const boundaryChar = text[cursor];
    if (boundaryChar !== undefined && !/\s/.test(boundaryChar)) continue;

    return { unit: UNIT_ALIASES[phrase], rest: text.slice(cursor).trimStart() };
  }

  return null;
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
