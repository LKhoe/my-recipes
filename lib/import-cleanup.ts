// Clean-up applied to every import draft (JSON-LD, LLM, YouTube) before the user sees it. The
// prompt asks the model for the same things, but the JSON-LD path has no model at all and small
// free models don't always follow the prompt, so code has the last word.

import { parseIngredientLine } from "@/lib/services/ingredient-parser";
import type { RecipeIngredientInput } from "@/types";

function capitalizeFirst(text: string): string {
  return text.replace(/\p{L}/u, (first) => first.toLocaleUpperCase("pt-BR"));
}

// "Receita de bolo", "Receita fácil de pão", "Como fazer pudim", "Aprenda a fazer coxinha"
const TITLE_PREFIX =
  /^(?:(?:a\s+)?(?:melhor\s+)?receitas?\s+(?:(?:f[aá]cil|simples|r[aá]pida|caseira|perfeita|deliciosa|original|tradicional|incr[ií]vel)\s+(?:e\s+\S+\s+)?)?(?:de|da|do|das|dos)\s+|receitas?\s*[:\-–—|]\s*|(?:como\s+fazer|aprenda\s+a\s+fazer|fa[cç]a)\s+(?:(?:um|uma|o|a)\s+)?)/i;
// "Bolo de cenoura - Receita", "Pudim | Receitas Nestlé", "Coxinha (receita)"
const TITLE_SUFFIX = /\s*(?:[\-–—|:]\s*receitas?\b.*|\(\s*receitas?\s*\))$/i;

/** "Receita de Bolo de cenoura" -> "Bolo de cenoura". Leaves a title that is only "Receita" alone. */
export function cleanRecipeTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  const cleaned = trimmed.replace(TITLE_PREFIX, "").replace(TITLE_SUFFIX, "").trim();
  if (!cleaned) return trimmed;
  return cleaned === trimmed ? trimmed : capitalizeFirst(cleaned);
}

// Product names that are brands in everyday Brazilian use, with the generic name to use instead.
const BRAND_PRODUCTS: [RegExp, string][] = [
  [/leite\s+moça/, "leite condensado"],
  [/(?:amido\s+de\s+milho\s+)?maizena/, "amido de milho"],
  [/(?:achocolatado\s+(?:em\s+pó\s+)?)?(?:nescau|toddy)/, "achocolatado em pó"],
  [/(?:tempero\s+(?:pronto\s+)?)?sazón/, "tempero pronto"],
  [/(?:requeijão\s+(?:cremoso\s+)?)?catupiry/, "requeijão cremoso"],
  [/(?:cream\s+cheese\s+)?philadelphia/, "cream cheese"],
  [/(?:leite\s+(?:em\s+pó\s+)?)?ninho/, "leite em pó"],
  [/fermento\s+(?:químico\s+)?(?:em\s+pó\s+)?royal/, "fermento em pó"],
  [/(?:maionese\s+)?hellmann'?s/, "maionese"],
];

// Brands to drop where they qualify a generic product ("creme de leite Nestlé"). Only names that
// are never ordinary words: "Vigor", "Sol", "Garoto" or "Quero" would eat "mexa com vigor".
const BRAND_NAMES = [
  "Nestlé",
  "Nestle",
  "Itambé",
  "Piracanjuba",
  "Italac",
  "Parmalat",
  "Qualy",
  "Doriana",
  "Becel",
  "Sadia",
  "Perdigão",
  "Seara",
  "Knorr",
  "Maggi",
  "Arisco",
  "Kitano",
  "Yoki",
  "Fugini",
  "Pomarola",
  "Dona Benta",
  "Fleischmann",
  "Dr\\. Oetker",
  "Oetker",
  "Harald",
  "Melken",
  "Mococa",
  "Danone",
  "Batavo",
  "Tirolez",
  "Polenghi",
  "Président",
  "Bauducco",
  "Ajinomoto",
  "Kikkoman",
  "Liza",
  "Camil",
  "Tio João",
  "Gallo",
  "Andorinha",
  "Swift",
  "Heinz",
];

const BRAND_PATTERN = new RegExp(
  `(?:\\s*\\b(?:da|do|de)\\s+marca|\\s*\\b(?:marca|tipo)|\\s+(?:da|do|de))?\\s*(?<![\\p{L}\\d])(?:${BRAND_NAMES.join("|")})(?![\\p{L}\\d])(?:\\s*®)?`,
  "giu",
);

/** Swaps brand-name products for the generic name and drops brands that qualify a product. */
export function removeBrands(text: string): string {
  let result = text;
  for (const [product, generic] of BRAND_PRODUCTS) {
    const pattern = new RegExp(`(?<![\\p{L}\\d])(?:${product.source})(?![\\p{L}\\d])`, "giu");
    // Keeps a capital at the start of a sentence: "Leite Moça" -> "Leite condensado".
    result = result.replace(pattern, (match: string, offset: number) =>
      offset === 0 && /^\p{Lu}/u.test(match) ? capitalizeFirst(generic) : generic,
    );
  }
  return result
    .replace(BRAND_PATTERN, "")
    // "amido de milho (Maizena)" became "amido de milho (amido de milho)"
    .replace(/([\p{L}][\p{L} ]*)\s*\(\s*\1\s*\)/giu, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** "de farinha de trigo" -> "farinha de trigo": the "de" of "2 xícaras de farinha" isn't part of the name. */
export function cleanIngredientName(name: string): string {
  return removeBrands(name)
    .replace(/^(?:(?:de|da|do|das|dos|d'|of)\s+)+/i, "")
    .trim();
}

function cleanNote(note: string | null): string | null {
  if (!note) return null;
  return removeBrands(note).replace(/^[\s,;]+|[\s,;]+$/g, "") || null;
}

// "manteiga ou margarina", outside parentheses
const OR_SPLIT = /\s+ou\s+(?![^()]*\))/i;

/**
 * An "or" in the name or the note becomes an alternative row: "manteiga ou margarina",
 * "leite (ou água)", "100 g manteiga ou 1/2 xícara de óleo". The alternative takes the
 * ingredient's amount when it states none of its own.
 */
function splitAlternatives(item: RecipeIngredientInput): RecipeIngredientInput[] {
  if (item.alternative) return [item];

  let primaryName = item.ingredientName;
  let note = item.note;
  const optionTexts: string[] = [];

  const nameParts = primaryName.split(OR_SPLIT);
  if (nameParts.length > 1 && nameParts.every((p) => p.trim())) {
    primaryName = nameParts[0];
    optionTexts.push(...nameParts.slice(1));
  }
  const noteOption = note?.match(/^ou\s+(.+)$/i);
  if (noteOption) {
    optionTexts.push(noteOption[1]);
    note = null;
  }
  if (optionTexts.length === 0) return [item];

  const options = optionTexts.map((text): RecipeIngredientInput => {
    const parsed = parseIngredientLine(text);
    const ownAmount = parsed.quantity !== null;
    return {
      ingredientName: parsed.name,
      quantity: ownAmount ? parsed.quantity : item.quantity,
      unit: ownAmount ? parsed.unit : item.unit,
      note: parsed.note,
      group: item.group,
      alternative: true,
      inferred: false,
    };
  });
  return [{ ...item, ingredientName: primaryName, note }, ...options];
}

/** Applies the name/note clean-up and the "or" split to a draft's ingredient list. */
export function cleanImportedIngredients(items: RecipeIngredientInput[]): RecipeIngredientInput[] {
  return items
    .flatMap(splitAlternatives)
    .map((item) => ({ ...item, ingredientName: cleanIngredientName(item.ingredientName), note: cleanNote(item.note) }))
    .filter((item) => item.ingredientName.length > 0);
}
