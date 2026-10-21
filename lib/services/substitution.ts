import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { ingredientSubstitution, type IngredientSubstitute } from "@/lib/db/schema";
import { formatIngredientLine } from "@/lib/format";
import { groupAlternatives } from "@/lib/ingredient-alternatives";
import { groupIngredientSections } from "@/lib/ingredient-groups";
import { requestLLMJson } from "@/lib/services/llm";
import { normalizeUnit } from "@/lib/services/ingredient-parser";
import { getRecipeById } from "@/lib/services/recipe";
import type { RecipeIngredientInput } from "@/types";

export type SubstitutionResult = {
  /** The recipe's own name for the ingredient when it was found there, else what was asked. */
  ingredientName: string;
  /** "recipe": the recipe already lists an "or" option, no model involved. */
  source: "recipe" | "ai";
  /** Amounts replace the recipe's own amount at its original servings. */
  suggestions: IngredientSubstitute[];
  tip: string | null;
};

/** Lowercase, accent-free: how a spoken or typed ingredient name is compared and cached. */
export function ingredientKey(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The recipe's ingredient that the user means: same name, else one name containing the other
 * ("cream cheese" -> "cream cheese light", "farinha de trigo" -> "farinha").
 */
export function findRecipeIngredient<T extends { ingredientName: string }>(items: T[], query: string): T | null {
  const key = ingredientKey(query);
  if (!key) return null;
  return (
    items.find((i) => ingredientKey(i.ingredientName) === key) ??
    items.find((i) => ingredientKey(i.ingredientName).includes(key)) ??
    items.find((i) => key.includes(ingredientKey(i.ingredientName))) ??
    null
  );
}

/** The "or" options the recipe itself gives for this ingredient, if any. */
export function recipeAlternativesFor(
  ingredients: RecipeIngredientInput[],
  target: RecipeIngredientInput,
): IngredientSubstitute[] {
  for (const section of groupIngredientSections(ingredients)) {
    for (const { primary, alternatives } of groupAlternatives(section.rows)) {
      const options = [primary, ...alternatives].map((row) => row.item);
      if (options.length < 2 || !options.includes(target)) continue;
      return options
        .filter((item) => item !== target)
        .map((item) => ({ name: item.ingredientName, quantity: item.quantity, unit: item.unit, note: item.note }));
    }
  }
  return [];
}

const llmSubstitutionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .default([]),
  tip: z.string().nullable().optional(),
});

const MAX_SUGGESTIONS = 3;

const SYSTEM_PROMPT = `You help a home cook in Brazil who is making the recipe below and doesn't have one of its ingredients. Suggest what to use instead.

Reply with ONLY a minified JSON object on a single line:
{"suggestions":[{"name":string,"quantity":number|null,"unit":string|null,"note":string|null}],"tip":string|null}

- Up to ${MAX_SUGGESTIONS} substitutes, best first, that work in THIS recipe (think about the ingredient's role: fat, acid, binder, leavening, sweetness, texture) and that a Brazilian kitchen usually has.
- "name": the generic ingredient in Brazilian Portuguese, lowercase, no brands ("iogurte natural", "suco de limão").
- "quantity"/"unit": the amount that replaces the recipe's amount of the missing ingredient. "unit" is one of: g, kg, ml, l, xíc, csp, csb, cch, dente, pitada, fatia, lata, maço, ramo, pacote, tablete, unidade. Both null when no amount makes sense.
- "note": a short how-to in Brazilian Portuguese when the swap needs one, else null. The cook may be making more or fewer servings, so give any extra amount as a proportion of the substitute, never as a fixed amount ("misture 1 csp de suco de limão para cada xícara de leite e espere 5 minutos").
- "tip": one short sentence in Brazilian Portuguese on how the result changes, or null.
- If nothing works (the ingredient is the heart of the dish), return "suggestions": [] and say so in "tip".`;

/**
 * The model's reply, cleaned: at most three substitutes, never the missing ingredient itself,
 * units normalized like everywhere else. Null when the reply doesn't have the expected shape.
 */
export function parseSubstitutionReply(
  raw: unknown,
  missingKey: string,
): { suggestions: IngredientSubstitute[]; tip: string | null } | null {
  const parsed = llmSubstitutionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const suggestions = parsed.data.suggestions
    .filter((s) => s.name.trim() && ingredientKey(s.name) !== missingKey)
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => ({
      name: s.name.trim().toLocaleLowerCase("pt-BR"),
      quantity: s.quantity ?? null,
      // A unit with no quantity can't be shown or scaled.
      unit: s.quantity != null ? normalizeUnit(s.unit ?? null) : null,
      note: s.note?.trim() || null,
    }));
  return { suggestions, tip: parsed.data.tip?.trim() || null };
}

function buildUserPrompt(
  title: string,
  ingredients: RecipeIngredientInput[],
  steps: string[],
  missing: string,
  missingLine: string | null,
): string {
  const key = ingredientKey(missing);
  const relevantSteps = steps.filter((s) => ingredientKey(s).includes(key));
  const stepsShown = (relevantSteps.length > 0 ? relevantSteps : steps).slice(0, 10);
  return [
    `Receita: ${title}`,
    "Ingredientes:",
    ...ingredients.map((i) => `- ${formatIngredientLine(i)}`),
    stepsShown.length > 0 ? "Modo de preparo (trechos):" : null,
    ...stepsShown.map((s) => `- ${s}`),
    "",
    `Ingrediente que falta: ${missingLine ?? missing}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function readCache(recipeId: string, key: string, recipeUpdatedAt: Date) {
  const [row] = await db
    .select({ suggestions: ingredientSubstitution.suggestions, tip: ingredientSubstitution.tip })
    .from(ingredientSubstitution)
    .where(
      and(
        eq(ingredientSubstitution.recipeId, recipeId),
        eq(ingredientSubstitution.ingredientKey, key),
        gte(ingredientSubstitution.createdAt, recipeUpdatedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function writeCache(recipeId: string, key: string, suggestions: IngredientSubstitute[], tip: string | null) {
  await db
    .insert(ingredientSubstitution)
    .values({ recipeId, ingredientKey: key, suggestions, tip, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [ingredientSubstitution.recipeId, ingredientSubstitution.ingredientKey],
      set: { suggestions, tip, createdAt: new Date() },
    });
}

declare global {
  var substitutionsInFlight: Map<string, Promise<SubstitutionResult | null>> | undefined;
}

// The Echo gives up after 8 s while the free models can take longer: a question asked again while
// the first call is still running waits for that call instead of starting another.
const inFlight: Map<string, Promise<SubstitutionResult | null>> = globalThis.substitutionsInFlight ?? new Map();
globalThis.substitutionsInFlight = inFlight;

async function computeSubstitutes(recipeId: string, ingredientName: string): Promise<SubstitutionResult | null> {
  const detail = await getRecipeById(recipeId);
  if (!detail) return null;

  const target = findRecipeIngredient(detail.ingredients, ingredientName);
  const name = target?.ingredientName ?? ingredientName.trim();

  if (target) {
    const fromRecipe = recipeAlternativesFor(detail.ingredients, target);
    if (fromRecipe.length > 0) return { ingredientName: name, source: "recipe", suggestions: fromRecipe, tip: null };
  }

  const key = ingredientKey(name);
  const cached = await readCache(recipeId, key, new Date(detail.updatedAt));
  if (cached) return { ingredientName: name, source: "ai", suggestions: cached.suggestions, tip: cached.tip };

  const raw = await requestLLMJson({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(
      detail.title,
      detail.ingredients,
      detail.steps.map((s) => s.text),
      name,
      target ? formatIngredientLine(target) : null,
    ),
    // Free models (lib/llm-tiers.ts)
    tier: "simple",
    maxTokens: 800,
    temperature: 0.3,
  });
  const parsed = parseSubstitutionReply(raw, key);
  // A reply that didn't parse isn't worth remembering: the next question tries again.
  if (parsed) await writeCache(recipeId, key, parsed.suggestions, parsed.tip);
  return { ingredientName: name, source: "ai", suggestions: parsed?.suggestions ?? [], tip: parsed?.tip ?? null };
}

/**
 * "Não tenho X, o que uso no lugar?" for one recipe: the recipe's own "or" option when it has one,
 * else a cached or fresh answer from the free LLM tier. Null when the recipe doesn't exist.
 */
export function suggestSubstitutes(recipeId: string, ingredientName: string): Promise<SubstitutionResult | null> {
  const flightKey = `${recipeId}:${ingredientKey(ingredientName)}`;
  const running = inFlight.get(flightKey);
  if (running) return running;

  const promise = computeSubstitutes(recipeId, ingredientName).finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, promise);
  return promise;
}
