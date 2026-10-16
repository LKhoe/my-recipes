import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanIngredientNote, extractRecipeWithLLM, LLMExtractionError } from "./llm";

function mockOpenRouterResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  };
}

describe("extractRecipeWithLLM", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("maps a valid response, preserving the inferred-quantity flag (SPEC §4.6b)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOpenRouterResponse({
        recipeFound: true,
        title: "Grandma's Tomato Pasta",
        description: null,
        servings: 4,
        prepTime: null,
        cookTime: 20,
        steps: [{ text: "Simmer the sauce for 20 minutes.", durationMinutes: 20 }],
        ingredients: [
          { ingredientName: "olive oil", quantity: 2, unit: "tbsp", note: null, inferred: true },
          { ingredientName: "salt", quantity: null, unit: null, note: "a pinch", inferred: false },
        ],
      }),
    ) as unknown as typeof fetch;

    const draft = await extractRecipeWithLLM("hey everyone welcome back...", {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: null,
      videoUrl: "https://youtube.com/watch?v=abc123",
    });

    expect(draft.recipeFound).toBe(true);
    expect(draft.title).toBe("Grandma's Tomato Pasta");
    expect(draft.servings).toBe(4);
    expect(draft.videoUrl).toBe("https://youtube.com/watch?v=abc123");
    expect(draft.ingredients[0]).toMatchObject({ ingredientName: "olive oil", quantity: 2, inferred: true });
    expect(draft.ingredients[1]).toMatchObject({ ingredientName: "salt", quantity: null, inferred: false });
  });

  it("keeps the same ingredient once per section, with cleaned section labels", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOpenRouterResponse({
        recipeFound: true,
        title: "Risoto de cogumelos",
        ingredients: [
          { ingredientName: "cebola", quantity: 1, unit: "unidade", note: null, group: "CALDO:", inferred: false },
          { ingredientName: "cenoura", quantity: 1, unit: "unidade", note: null, group: "CALDO:", inferred: false },
          { ingredientName: "cebola", quantity: 0.5, unit: "unidade", note: null, group: "Risoto", inferred: false },
          { ingredientName: "sal", quantity: null, unit: null, note: "a gosto", inferred: false },
        ],
      }),
    ) as unknown as typeof fetch;

    const draft = await extractRecipeWithLLM("CALDO: 1 cebola, 1 cenoura. RISOTO: 1/2 cebola...", {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: null,
      videoUrl: null,
    });

    expect(draft.ingredients.map((i) => [i.group, i.ingredientName, i.quantity])).toEqual([
      ["Caldo", "cebola", 1],
      ["Caldo", "cenoura", 1],
      ["Risoto", "cebola", 0.5],
      [null, "sal", null],
    ]);
  });

  it("asks the model for sections and not to sum an ingredient across them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockOpenRouterResponse({ recipeFound: false }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await extractRecipeWithLLM("...", { context: "webpage", allowEstimation: false, sourceUrl: null, videoUrl: null });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt: string = body.messages[0].content;
    expect(systemPrompt).toContain('"group": string | null');
    expect(systemPrompt).toContain("never add the amounts together");
  });

  it("drops a unit that comes without a quantity", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOpenRouterResponse({
        recipeFound: true,
        title: "Coração de boi acebolado",
        ingredients: [{ ingredientName: "cheiro verde", quantity: null, unit: "maço", note: "a gosto", inferred: false }],
      }),
    ) as unknown as typeof fetch;

    const draft = await extractRecipeWithLLM("oi gente...", {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: null,
      videoUrl: null,
    });

    expect(draft.ingredients[0]).toMatchObject({ quantity: null, unit: null, note: "a gosto" });
  });

  it("cleans estimate markers out of notes and clears inferred when there is no quantity", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOpenRouterResponse({
        recipeFound: true,
        title: "Vinagrete",
        ingredients: [
          { ingredientName: "cebola", quantity: 1, unit: "unidade", note: "picada, inferred", inferred: true },
          { ingredientName: "azeite", quantity: 2, unit: "csp", note: "(estimado)", inferred: true },
          { ingredientName: "sal", quantity: null, unit: null, note: "a gosto", inferred: true },
        ],
      }),
    ) as unknown as typeof fetch;

    const draft = await extractRecipeWithLLM("oi gente...", {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: null,
      videoUrl: null,
    });

    expect(draft.ingredients[0]).toMatchObject({ note: "picada", inferred: true });
    expect(draft.ingredients[1]).toMatchObject({ note: null, inferred: true });
    expect(draft.ingredients[2]).toMatchObject({ note: "a gosto", inferred: false });
  });

  it("drops step durations that are waits rather than timers", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOpenRouterResponse({
        recipeFound: true,
        title: "Kimchi",
        steps: [
          { text: "Misture tudo.", durationMinutes: 5 },
          { text: "Asse por 3 horas.", durationMinutes: 180 },
          { text: "Deixe na geladeira por 20 horas.", durationMinutes: 1200 },
          { text: "Fermente por 14 dias.", durationMinutes: 20160 },
          { text: "Sirva.", durationMinutes: 0 },
        ],
      }),
    ) as unknown as typeof fetch;

    const draft = await extractRecipeWithLLM("...", {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: null,
      videoUrl: null,
    });

    expect(draft.steps.map((s) => s.durationMinutes)).toEqual([5, 180, undefined, undefined, undefined]);
  });

  it("asks for Brazilian Portuguese and caps step timers in the prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockOpenRouterResponse({ recipeFound: false }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await extractRecipeWithLLM("Title: Kimchi\n\nDescription:\nIngredients...", {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: null,
      videoUrl: null,
    });

    const systemPrompt: string = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(systemPrompt).toContain("Brazilian Portuguese, translating");
    expect(systemPrompt).toContain("at most 180");
  });

  it("reports recipeFound: false without throwing when no recipe is present", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOpenRouterResponse({ recipeFound: false })) as unknown as typeof fetch;

    const draft = await extractRecipeWithLLM("just a vlog about my day, no cooking", {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: null,
      videoUrl: "https://youtube.com/watch?v=xyz",
    });

    expect(draft.recipeFound).toBe(false);
    expect(draft.ingredients).toEqual([]);
  });

  it("throws LLMExtractionError on a non-OK HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" }) as unknown as typeof fetch;

    await expect(
      extractRecipeWithLLM("text", {
        context: "webpage",
        allowEstimation: false,
        sourceUrl: "https://example.com",
        videoUrl: null,
      }),
    ).rejects.toThrow(LLMExtractionError);
  });

  it("throws LLMExtractionError when OpenRouter can't be reached", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    await expect(
      extractRecipeWithLLM("text", {
        context: "youtube",
        allowEstimation: true,
        sourceUrl: null,
        videoUrl: null,
      }),
    ).rejects.toThrow(LLMExtractionError);
  });

  it("throws LLMExtractionError when the model response isn't valid JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json at all" } }] }),
    }) as unknown as typeof fetch;

    await expect(
      extractRecipeWithLLM("text", {
        context: "webpage",
        allowEstimation: false,
        sourceUrl: "https://example.com",
        videoUrl: null,
      }),
    ).rejects.toThrow(LLMExtractionError);
  });

  it("throws when OPENROUTER_API_KEY is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      extractRecipeWithLLM("text", {
        context: "webpage",
        allowEstimation: false,
        sourceUrl: null,
        videoUrl: null,
      }),
    ).rejects.toThrow(LLMExtractionError);
  });
});

describe("cleanIngredientNote", () => {
  it.each([
    ["picada, inferred", "picada"],
    ["inferred", null],
    ["picada (estimado)", "picada"],
    ["quantidade estimada, picada", "picada"],
    ["Estimated; finely chopped", "finely chopped"],
    ["picada, em cubos", "picada, em cubos"],
    ["a gosto", "a gosto"],
    ["", null],
    [null, null],
  ])("%j -> %j", (input, expected) => {
    expect(cleanIngredientNote(input)).toBe(expected);
  });
});
