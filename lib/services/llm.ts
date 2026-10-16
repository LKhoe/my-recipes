import { z } from "zod";
import type { RecipeDraft } from "@/types";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-20260507";

export class LLMExtractionError extends Error {}

const llmStepSchema = z.object({
  text: z.string(),
  durationMinutes: z.number().nullable().optional(),
});

const llmIngredientSchema = z.object({
  ingredientName: z.string(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
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
  "ingredients": [{ "ingredientName": string, "quantity": number | null, "unit": string | null, "note": string | null, "inferred": boolean }]
}

Rules:
- If there is no recipe in the text, set "recipeFound": false and leave the rest empty/null.
- "title" is the dish's name in sentence case, in the recipe's own language: capitalize only the first word and proper nouns (e.g. "Coração de boi acebolado", never "CORAÇÃO DE BOI ACEBOLADO" or "Coração De Boi Acebolado"), with no channel name, emojis or hashtags.
- Split every ingredient line into "ingredientName" (bare noun), "quantity" (a plain decimal number), "unit" (metric or a common Brazilian Portuguese cooking-unit token: g, kg, ml, l, xíc, csp, csb, cch, dente, pitada, fatia, lata, maço, ramo, pacote, tablete, unidade), and "note" (prep detail like "picado", "derretida", "a gosto" — or null). Normalize the unit to one of those tokens even if the source spells it out differently: "colher de sopa" -> "csp", "colher de sobremesa" or "colherinha de sobremesa" -> "csb", "colher de chá" or "colherinha" -> "cch", "xícara" -> "xíc".
- "quantity" and "unit" come as a pair: both set, or both null. Never return a quantity without a unit or a unit without a quantity. Whole items counted by number (ovos, cebolas, tomates, limões) take the unit "unidade". An ingredient with no amount (one the rule below doesn't have you estimate) gets null for both, with "a gosto" in "note" only when the source says so.
- prepTime/cookTime are total minutes as a number, only if explicitly stated; otherwise null.
- "durationMinutes" on a step is a number only when that step states a specific duration (e.g. "bake for 25 minutes" -> 25); otherwise null.
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

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      durationMinutes: s.durationMinutes ?? undefined,
    })),
    ingredients: data.ingredients.map((i) => ({
      ingredientName: i.ingredientName,
      quantity: i.quantity ?? null,
      // A unit with no quantity ("pitada" of nothing) can't be scaled or merged on a shopping list.
      unit: i.quantity != null ? (i.unit ?? null) : null,
      note: i.note ?? null,
      inferred: i.inferred ?? false,
    })),
    sourceUrl: opts.sourceUrl,
    videoUrl: opts.videoUrl,
    imageUrl: opts.imageUrl ?? null,
  };
}
