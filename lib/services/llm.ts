import { z } from "zod";
import { normalizeGroupLabel } from "@/lib/ingredient-groups";
import type { RecipeDraft } from "@/types";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-20260507";

export class LLMExtractionError extends Error {}

// Cook mode turns a step's durationMinutes into a countdown. Anything longer than this is a wait
// (overnight rise, days of fermentation), not a timer anyone watches, so it's dropped.
export const MAX_STEP_DURATION_MINUTES = 180;

const llmStepSchema = z.object({
  text: z.string(),
  durationMinutes: z.number().nullable().optional(),
});

const llmIngredientSchema = z.object({
  ingredientName: z.string(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  group: z.string().nullable().optional(),
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

function buildSystemPrompt(context: ExtractionContext, allowEstimation: boolean): string {
  const sourceLabel = {
    webpage: "a recipe webpage's text content",
    youtube: "a YouTube video's title, description and spoken transcript (either may be missing)",
  }[context];

  return `You extract a single cooking recipe from ${sourceLabel}. Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:

{
  "recipeFound": boolean,
  "title": string | null,
  "description": string | null,
  "servings": number | null,
  "prepTime": number | null,
  "cookTime": number | null,
  "steps": [{ "text": string, "durationMinutes": number | null }],
  "ingredients": [{ "ingredientName": string, "quantity": number | null, "unit": string | null, "note": string | null, "group": string | null, "inferred": boolean }]
}

Rules:
- If there is no recipe in the text, set "recipeFound": false and leave the rest empty/null.
- Write every text field (title, description, step text, ingredient names, notes) in Brazilian Portuguese, translating from the source if it is in another language.
- "title" is the dish's name in sentence case: capitalize only the first word and proper nouns (e.g. "Coração de boi acebolado", never "CORAÇÃO DE BOI ACEBOLADO" or "Coração De Boi Acebolado"), with no channel name, emojis or hashtags.
- Split every ingredient line into "ingredientName" (bare noun), "quantity" (a plain decimal number), "unit" (metric or a common Brazilian Portuguese cooking-unit token: g, kg, ml, l, xíc, csp, csb, cch, dente, pitada, fatia, lata, maço, ramo, pacote, tablete, unidade), and "note" (prep detail like "picado", "derretida", "a gosto" — or null; never "inferred" or "estimado", that goes in the "inferred" field). Normalize the unit to one of those tokens even if the source spells it out differently: "colher de sopa" -> "csp", "colher de sobremesa" or "colherinha de sobremesa" -> "csb", "colher de chá" or "colherinha" -> "cch", "xícara" -> "xíc".
- "quantity" and "unit" come as a pair: both set, or both null. Never return a quantity without a unit or a unit without a quantity. Whole items counted by number (ovos, cebolas, tomates, limões) take the unit "unidade". An ingredient with no amount (one the rule below doesn't have you estimate) gets null for both, with "a gosto" in "note" only when the source says so.
- "group" names the part of the recipe an ingredient belongs to, when the source splits the ingredients into parts (e.g. "CALDO:", "Para a massa", "Recheio", "Molho"): the part's short name in sentence case ("Caldo", "Massa", "Recheio"), the same on every ingredient of that part, with the ingredients listed in the source's order, part by part. When an ingredient appears in more than one part, list it once per part with that part's own quantity; never add the amounts together (1 cebola in "Caldo" and 1/2 cebola in "Risoto" stay two entries, not "1.5 cebola"). A recipe with a single ingredient list gets null on every ingredient.
- prepTime/cookTime are total minutes as a number, only if explicitly stated; otherwise null.
- "durationMinutes" on a step is a number only when that step states a specific duration of active cooking someone would time (e.g. "bake for 25 minutes" -> 25), at most ${MAX_STEP_DURATION_MINUTES}; otherwise null. Long waits (resting overnight, marinating for hours, fermenting for days) get null, with the time kept in the step text.
- "servings" is a plain integer if stated (e.g. "serves 4-6" -> 4); otherwise null.
${
  context === "youtube"
    ? "- The transcript is usually auto-generated captions: no punctuation, some misheard words, plus greetings and channel chatter to ignore. Where the description lists ingredients or quantities, prefer it over the transcript; take the method from the transcript.\n"
    : ""
}${
  allowEstimation
    ? '- If a quantity is vague ("uma pitada de sal", "um fio de azeite", "um punhado de salsinha", "um pouco de shoyu", "dois dedos de água"), give your best numeric estimate with a sensible unit from the list (liquids in ml or csp, herbs in maço or csp) and set "inferred": true. The same goes for an ingredient added with no amount at all ("adicione cebola, pimentão e tomate"): estimate a typical amount for the recipe (e.g. 1 unidade de cebola). Only when it is truly unquantifiable ("sal a gosto") leave quantity/unit null and "inferred": false.'
    : '- Only set "quantity" when a number is explicitly stated in the text. Never estimate. "inferred" is always false.'
}`;
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
  },
): Promise<RecipeDraft> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new LLMExtractionError("OPENROUTER_API_KEY is not configured.");
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Minhas Receitas",
      },
      body: JSON.stringify({
        model,
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
    throw new LLMExtractionError(`OpenRouter request failed: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LLMExtractionError(`OpenRouter request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMExtractionError("OpenRouter response had no message content.");
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
    ingredients: data.ingredients.map((i) => ({
      ingredientName: i.ingredientName,
      quantity: i.quantity ?? null,
      // A unit with no quantity ("pitada" of nothing) can't be scaled or merged on a shopping list.
      unit: i.quantity != null ? (i.unit ?? null) : null,
      note: cleanIngredientNote(i.note),
      group: normalizeGroupLabel(i.group),
      // Nothing was estimated when there is no quantity.
      inferred: i.quantity != null && (i.inferred ?? false),
    })),
    sourceUrl: opts.sourceUrl,
    videoUrl: opts.videoUrl,
    imageUrl: opts.imageUrl ?? null,
  };
}
