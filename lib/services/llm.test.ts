import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRecipeWithLLM, LLMExtractionError } from "./llm";

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
      context: "youtube-transcript",
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

  it("reports recipeFound: false without throwing when no recipe is present", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOpenRouterResponse({ recipeFound: false })) as unknown as typeof fetch;

    const draft = await extractRecipeWithLLM("just a vlog about my day, no cooking", {
      context: "youtube-transcript",
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
