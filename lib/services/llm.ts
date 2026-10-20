import { z } from "zod";
import { normalizeGroupLabel } from "@/lib/ingredient-groups";
import { DEFAULT_LLM_TIER, type LLMTier } from "@/lib/llm-tiers";
import type { RecipeDraft } from "@/types";

// LocalInfra's LLM gateway picks the model: the app only asks for a tier (lib/llm-tiers.ts),
// which the user chooses on import.

export class LLMExtractionError extends Error {}

/** The gateway's limit on this app's paid calls was reached; retrying right away won't help. */
export class LLMLimitError extends LLMExtractionError {}

// Cook mode turns a step's durationMinutes into a countdown. Anything longer than this is a wait
// (overnight rise, days of fermentation), not a timer anyone watches, so it's dropped.
export const MAX_STEP_DURATION_MINUTES = 180;

const llmStepSchema = z.object({
  text: z.string(),
  durationMinutes: z.number().nullable().optional(),
});

const llmAlternativeSchema = z.object({
  ingredientName: z.string(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const llmIngredientSchema = z.object({
  ingredientName: z.string(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  group: z.string().nullable().optional(),
  alternatives: z.array(llmAlternativeSchema).nullable().optional(),
  inferred: z.boolean().optional(),
});

const llmRecipeSchema = z.object({
  recipeFound: z.boolean(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  servings: z.number().nullable().optional(),
  prepTime: z.number().nullable().optional(),
  cookTime: z.number().nullable().optional(),
  steps: z.array(llmStepSchema).default([]),
  ingredients: z.array(llmIngredientSchema).default([]),
});

export type ExtractionContext = "webpage" | "youtube";

const UNIT_TOKENS = "g, kg, ml, l, xíc, csp, csb, cch, dente, pitada, fatia, lata, maço, ramo, pacote, tablete, unidade";

// Written in English (models follow instructions in English best), with Brazilian Portuguese
// examples, since every text field of the answer is in pt-BR. Code repeats the most important
// rules after the call (title, brands, units, durations: lib/import-cleanup.ts and below), because
// the free tier's small models don't always follow them.
function buildSystemPrompt(context: ExtractionContext, allowEstimation: boolean): string {
  const sourceLabel = {
    webpage: "the text of a recipe webpage (it may also contain menus, ads, comments and links to other recipes)",
    youtube: "a YouTube cooking video's title, description and spoken transcript (any of them may be missing)",
  }[context];

  const sourceRules = {
    webpage:
      "- Use only the main recipe of the page. Ignore navigation, ads, reader comments, nutrition tables and other recipes linked from the page.",
    youtube:
      "- The transcript is usually auto-generated captions: no punctuation, some misheard words, plus greetings, sponsor reads and channel chatter (\"deixe seu like\", \"se inscreva\") to ignore.\n- Where the description lists ingredients or quantities, prefer it over the transcript; take the method from the transcript when the description has none.",
  }[context];

  const estimationRules = allowEstimation
    ? `- A vague amount ("uma pitada de sal", "um fio de azeite", "um punhado de salsinha", "um pouco de shoyu", "dois dedos de água") gets your best numeric estimate with a sensible unit (liquids in ml or csp, herbs in maço or csp) and "inferred": true.
- An ingredient added with no amount at all ("adicione cebola, pimentão e tomate") also gets a typical amount for the recipe (e.g. 1 unidade de cebola) and "inferred": true.
- Only a truly unquantifiable one ("sal a gosto") keeps quantity/unit null and "inferred": false.`
    : `- Set "quantity" only when the text states a number. Never estimate: "inferred" is always false.`;

  return `You turn ${sourceLabel} into one structured cooking recipe. Reply with ONLY a JSON object, no markdown fences and no comments, of exactly this shape:

{
  "recipeFound": boolean,
  "title": string | null,
  "description": string | null,
  "servings": number | null,
  "prepTime": number | null,
  "cookTime": number | null,
  "steps": [{ "text": string, "durationMinutes": number | null }],
  "ingredients": [{
    "ingredientName": string,
    "quantity": number | null,
    "unit": string | null,
    "note": string | null,
    "group": string | null,
    "alternatives": [{ "ingredientName": string, "quantity": number | null, "unit": string | null, "note": string | null }],
    "inferred": boolean
  }]
}

General
- If the text has no recipe (no ingredients and no method), set "recipeFound": false and leave everything else empty or null. Never invent a recipe.
- Write every text field in Brazilian Portuguese, translating from the source when needed.
- Never mention brands, anywhere (title, ingredients, notes, steps): use the generic product. "Leite Moça" -> "leite condensado", "Maizena" -> "amido de milho", "creme de leite Nestlé" -> "creme de leite", "Nescau" -> "achocolatado em pó", "Catupiry" -> "requeijão cremoso", "fermento Royal" -> "fermento em pó", "caldo Knorr" -> "caldo de galinha".
${sourceRules}

Title
- The dish's name only, in sentence case: capitalize the first word and proper nouns ("Coração de boi acebolado", never "CORAÇÃO DE BOI ACEBOLADO" or "Coração De Boi Acebolado").
- Never start with "Receita de", "Receita:", "Como fazer" or "Aprenda a fazer", and drop marketing words that aren't part of the dish's name ("o melhor", "perfeito", "incrível", "fácil e rápido"): "RECEITA DE BOLO DE CENOURA FOFINHO (MUITO FÁCIL)" -> "Bolo de cenoura fofinho".
- No channel name, emojis or hashtags.

Description
- One or two sentences in your own words about the dish (what it is, its texture, when to serve it), or null when the source says nothing useful. No ingredient list, links, sponsor mentions or calls to subscribe.

Ingredients
- One entry per ingredient line, in the source's order.
- "ingredientName" is the bare generic name in lowercase, as a shopper would look for it ("farinha de trigo", "ovo", "cebola", "leite condensado"). It never starts with a preposition: the "de" of "2 xícaras de farinha" belongs to neither the unit nor the name ("farinha", not "de farinha"). It holds no amount, unit, preparation or brand.
- "unit" is one of these tokens: ${UNIT_TOKENS}. Convert other spellings: "colher de sopa" -> "csp", "colher de sobremesa" -> "csb", "colher de chá" or "colherinha" -> "cch", "xícara" -> "xíc", "gramas" -> "g". Whole items counted by number (ovos, cebolas, tomates, limões) take "unidade".
- "quantity" is a plain decimal number ("1/2" -> 0.5, "1 e 1/2" -> 1.5; a range "2 a 3" -> 2). "quantity" and "unit" come as a pair: both set or both null, never one without the other.
- "note" holds preparation or detail ("picada", "derretida", "em temperatura ambiente", "opcional", "a gosto"), or null. Never put "inferred" or "estimado" there.
- "alternatives" lists substitutes the source offers for that ingredient ("manteiga ou margarina", "leite (ou água)", "100 g de manteiga ou 1/2 xícara de óleo"). The first option is the ingredient itself; the others go in "alternatives", each with its own quantity and unit (repeat the ingredient's amount when the source gives a single amount for both). Use [] when there is no substitute. Not for optional ingredients (that's "opcional" in "note") and not for different ingredients listed together.
- "group" names the part of the recipe an ingredient belongs to when the source splits the ingredients into parts ("CALDO:", "Para a massa", "Recheio", "Cobertura"): the part's short name in sentence case ("Caldo", "Massa", "Recheio"), the same on every ingredient of that part, part by part in the source's order. An ingredient that appears in more than one part is listed once per part with that part's own amount, never summed (1 cebola in "Caldo" and 1/2 cebola in "Risoto" stay two entries). A recipe with a single ingredient list has null on every ingredient.
${estimationRules}

Steps
- The method in the source's order, one step per action or short group of related actions, in the imperative ("Misture a farinha e o açúcar.", "Leve ao forno preaquecido a 180 °C."). Don't cram the whole method into one step or split one sentence into several.
- Keep temperatures, times and visual cues ("até dourar"); leave out chatter, tips about the channel and serving suggestions that aren't part of the method.
- "durationMinutes" is a number only when the step states a specific duration of active cooking someone would time ("asse por 25 minutos" -> 25), at most ${MAX_STEP_DURATION_MINUTES}; otherwise null. Long waits (resting overnight, marinating for hours, fermenting for days) get null, with the time kept in the step text.

Numbers
- "prepTime" and "cookTime" are total minutes, only when the source states them; otherwise null.
- "servings" is a plain integer when stated ("serve 4 a 6 pessoas" -> 4, "rende 20 brigadeiros" -> 20); otherwise null.

Example of two ingredient entries, from "200 g de manteiga sem sal (ou margarina)" and "Sal a gosto":
{ "ingredientName": "manteiga sem sal", "quantity": 200, "unit": "g", "note": null, "group": null, "alternatives": [{ "ingredientName": "margarina", "quantity": 200, "unit": "g", "note": null }], "inferred": false }
{ "ingredientName": "sal", "quantity": null, "unit": null, "note": "a gosto", "group": null, "alternatives": [], "inferred": false }`;
}

// The model sometimes writes its estimate flag into the note too ("picada, inferred", "(estimado)").
const ESTIMATE_MARKER = /\(?\s*\b(?:quantidade\s+)?(?:inferred|inferid[oa]|estimated|estimate|estimad[oa]|estimativa)\b\s*\)?/gi;

export function cleanIngredientNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const cleaned = note
    .replace(ESTIMATE_MARKER, "")
    .replace(/\s*([,;])[\s,;]*/g, "$1 ")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .replace(/\s+/g, " ");
  return cleaned || null;
}

function cleanStepDuration(minutes: number | null | undefined): number | undefined {
  if (minutes == null || minutes <= 0 || minutes > MAX_STEP_DURATION_MINUTES) return undefined;
  return minutes;
}

function stripJsonFences(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : content).trim();
}

export async function extractRecipeWithLLM(
  text: string,
  opts: {
    context: ExtractionContext;
    allowEstimation: boolean;
    sourceUrl: string | null;
    videoUrl: string | null;
    imageUrl?: string | null;
    tier?: LLMTier;
  },
): Promise<RecipeDraft> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new LLMExtractionError("LLM_BASE_URL / LLM_API_KEY are not configured.");
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.tier ?? DEFAULT_LLM_TIER,
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(opts.context, opts.allowEstimation) },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (err) {
    // A network failure would otherwise surface as a generic 500 instead of an import error.
    throw new LLMExtractionError(`LLM request failed: ${(err as Error).message}`);
  }

  // The gateway's per-app limit on paid calls (monthly budget or calls per day)
  if (res.status === 429) {
    throw new LLMLimitError(
      "o limite de uso da IA foi atingido. Tente de novo mais tarde ou cadastre a receita à mão.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LLMExtractionError(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMExtractionError("LLM response had no message content.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripJsonFences(content));
  } catch {
    throw new LLMExtractionError("Could not parse JSON from the LLM response.");
  }

  const result = llmRecipeSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new LLMExtractionError(`LLM response did not match the expected shape: ${result.error.message}`);
  }

  const data = result.data;

  if (!data.recipeFound) {
    return {
      recipeFound: false,
      title: data.title ?? "",
      description: null,
      servings: null,
      prepTime: null,
      cookTime: null,
      steps: [],
      ingredients: [],
      sourceUrl: opts.sourceUrl,
      videoUrl: opts.videoUrl,
      imageUrl: opts.imageUrl ?? null,
    };
  }

  return {
    recipeFound: true,
    title: data.title ?? "",
    description: data.description ?? null,
    servings: data.servings ?? null,
    prepTime: data.prepTime ?? null,
    cookTime: data.cookTime ?? null,
    steps: data.steps.map((s) => ({
      text: s.text,
      durationMinutes: cleanStepDuration(s.durationMinutes),
    })),
    ingredients: data.ingredients.flatMap((i) => {
      const group = normalizeGroupLabel(i.group);
      const primary = {
        ingredientName: i.ingredientName,
        quantity: i.quantity ?? null,
        // A unit with no quantity ("pitada" of nothing) can't be scaled or merged on a shopping list.
        unit: i.quantity != null ? (i.unit ?? null) : null,
        note: cleanIngredientNote(i.note),
        group,
        // Nothing was estimated when there is no quantity.
        inferred: i.quantity != null && (i.inferred ?? false),
      };
      const alternatives = (i.alternatives ?? [])
        .filter((a) => a.ingredientName.trim())
        .map((a) => ({
          ingredientName: a.ingredientName,
          quantity: a.quantity ?? null,
          unit: a.quantity != null ? (a.unit ?? null) : null,
          note: cleanIngredientNote(a.note),
          group,
          alternative: true,
          inferred: false,
        }));
      return [primary, ...alternatives];
    }),
    sourceUrl: opts.sourceUrl,
    videoUrl: opts.videoUrl,
    imageUrl: opts.imageUrl ?? null,
  };
}
