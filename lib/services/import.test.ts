import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./html-fetch", () => ({
  fetchPageHtml: vi.fn(),
  stripToReadableText: vi.fn((html: string) => `stripped:${html}`),
  extractMetaImageUrl: vi.fn(() => null),
  resolveImageUrl: vi.fn((value: string | null) => value),
  PageFetchError: class PageFetchError extends Error {},
}));

vi.mock("./jsonld", () => ({
  extractRecipeFromJsonLd: vi.fn(),
}));

vi.mock("./llm", () => ({
  extractRecipeWithLLM: vi.fn(),
  LLMExtractionError: class LLMExtractionError extends Error {},
}));

vi.mock("./youtube", () => ({
  CaptionsBlockedError: class CaptionsBlockedError extends Error {},
  isYouTubeUrl: vi.fn(),
  parseYouTubeVideoId: vi.fn(),
  fetchVideoMetadata: vi.fn(),
  fetchTranscriptText: vi.fn(),
}));

import { extractMetaImageUrl, fetchPageHtml, stripToReadableText } from "./html-fetch";
import { extractRecipeFromJsonLd } from "./jsonld";
import { extractRecipeWithLLM, LLMExtractionError } from "./llm";
import {
  CaptionsBlockedError,
  fetchTranscriptText,
  fetchVideoMetadata,
  isYouTubeUrl,
  parseYouTubeVideoId,
} from "./youtube";
import { importRecipeFromUrl } from "./import";
import type { RecipeDraft } from "@/types";

const foundDraft: RecipeDraft = {
  recipeFound: true,
  title: "Test Recipe",
  description: null,
  servings: 2,
  prepTime: null,
  cookTime: null,
  steps: [{ text: "Do the thing." }],
  ingredients: [{ ingredientName: "salt", quantity: null, unit: null, note: null }],
  sourceUrl: null,
  videoUrl: null,
  imageUrl: null,
};

describe("importRecipeFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(isYouTubeUrl).mockReturnValue(false);
  });

  it("uses the JSON-LD draft directly and never calls the LLM when JSON-LD is present", async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue("<html>jsonld page</html>");
    vi.mocked(extractRecipeFromJsonLd).mockReturnValue(foundDraft);

    const draft = await importRecipeFromUrl("https://example.com/recipe");

    expect(draft).toEqual(foundDraft);
    expect(extractRecipeWithLLM).not.toHaveBeenCalled();
  });

  it("falls back to the page's share image when the JSON-LD has no photo", async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue("<html>jsonld page</html>");
    vi.mocked(extractMetaImageUrl).mockReturnValue("https://example.com/og.jpg");
    vi.mocked(extractRecipeFromJsonLd).mockReturnValue(foundDraft);

    const draft = await importRecipeFromUrl("https://example.com/recipe");

    expect(draft.imageUrl).toBe("https://example.com/og.jpg");
  });

  it("gives the LLM path the page's share image, since the model never returns one", async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue("<html>no structured data</html>");
    vi.mocked(extractMetaImageUrl).mockReturnValue("https://example.com/og.jpg");
    vi.mocked(extractRecipeFromJsonLd).mockReturnValue(null);
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    await importRecipeFromUrl("https://example.com/blog-post");

    expect(extractRecipeWithLLM).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ imageUrl: "https://example.com/og.jpg" }),
    );
  });

  it("cleans every draft: title prefix, brands, leading 'de' and 'ou' options", async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue("<html>jsonld page</html>");
    vi.mocked(extractRecipeFromJsonLd).mockReturnValue({
      ...foundDraft,
      title: "Receita de Pudim de leite",
      steps: [{ text: "Bata o Leite Moça com os ovos." }],
      ingredients: [
        { ingredientName: "de leite Moça", quantity: 1, unit: "lata", note: null },
        { ingredientName: "manteiga ou margarina", quantity: 1, unit: "csp", note: "para untar" },
      ],
    });

    const draft = await importRecipeFromUrl("https://example.com/recipe");

    expect(draft.title).toBe("Pudim de leite");
    expect(draft.steps[0].text).toBe("Bata o leite condensado com os ovos.");
    expect(draft.ingredients).toEqual([
      { ingredientName: "leite condensado", quantity: 1, unit: "lata", note: null },
      { ingredientName: "manteiga", quantity: 1, unit: "csp", note: "para untar" },
      {
        ingredientName: "margarina",
        quantity: 1,
        unit: "csp",
        note: null,
        group: undefined,
        alternative: true,
        inferred: false,
      },
    ]);
  });

  it("falls back to the LLM over stripped page text when JSON-LD is missing", async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue("<html>no structured data</html>");
    vi.mocked(extractRecipeFromJsonLd).mockReturnValue(null);
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    const draft = await importRecipeFromUrl("https://example.com/blog-post");

    expect(draft).toEqual(foundDraft);
    expect(stripToReadableText).toHaveBeenCalledWith("<html>no structured data</html>");
    expect(extractRecipeWithLLM).toHaveBeenCalledWith(
      "stripped:<html>no structured data</html>",
      expect.objectContaining({ context: "webpage", allowEstimation: false }),
    );
  });

  it("passes the chosen LLM tier on, for webpages and videos", async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue("<html>no structured data</html>");
    vi.mocked(extractRecipeFromJsonLd).mockReturnValue(null);
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);
    await importRecipeFromUrl("https://example.com/blog-post", { tier: "medium" });
    expect(extractRecipeWithLLM).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ tier: "medium" }));

    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({ title: "T", description: "d", thumbnailUrl: null });
    vi.mocked(fetchTranscriptText).mockResolvedValue("transcript");
    await importRecipeFromUrl("https://youtu.be/abc123", { tier: "hard" });
    expect(extractRecipeWithLLM).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ tier: "hard" }));
  });

  it("sends the title, description and transcript together in one LLM call", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      title: "Tomato Pasta",
      description: "ingredients: 400g tomatoes",
      thumbnailUrl: "https://img.example.com/thumb.jpg",
    });
    vi.mocked(fetchTranscriptText).mockResolvedValue("hey everyone... a glug of olive oil ...");
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft).toEqual({ ...foundDraft, warning: null });
    expect(extractRecipeWithLLM).toHaveBeenCalledTimes(1);
    expect(extractRecipeWithLLM).toHaveBeenCalledWith(
      "Title: Tomato Pasta\n\nDescription:\ningredients: 400g tomatoes\n\nTranscript:\nhey everyone... a glug of olive oil ...",
      expect.objectContaining({
        context: "youtube",
        allowEstimation: true,
        imageUrl: "https://img.example.com/thumb.jpg",
      }),
    );
  });

  it("reads the description alone with a warning when YouTube blocks the captions", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({ title: "Bolo", description: "ingredientes: ...", thumbnailUrl: null });
    vi.mocked(fetchTranscriptText).mockRejectedValue(new CaptionsBlockedError("blocked"));
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(extractRecipeWithLLM).toHaveBeenCalledWith("Title: Bolo\n\nDescription:\ningredientes: ...", expect.anything());
    expect(draft.warning).toMatch(/bloqueou temporariamente as legendas/);
  });

  it("fails before the LLM call on blocked captions when asked to (the queue)", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({ title: "Bolo", description: "ingredientes: ...", thumbnailUrl: null });
    vi.mocked(fetchTranscriptText).mockRejectedValue(new CaptionsBlockedError("blocked"));

    await expect(importRecipeFromUrl("https://youtu.be/abc123", { failOnBlockedCaptions: true })).rejects.toBeInstanceOf(
      CaptionsBlockedError,
    );
    expect(extractRecipeWithLLM).not.toHaveBeenCalled();
  });

  it("uses the transcript alone when there is no metadata (no API key)", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue(null);
    vi.mocked(fetchTranscriptText).mockResolvedValue("hey everyone... a glug of olive oil ...");
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft).toEqual({ ...foundDraft, warning: null });
    expect(extractRecipeWithLLM).toHaveBeenCalledWith(
      "Transcript:\nhey everyone... a glug of olive oil ...",
      expect.objectContaining({ context: "youtube", imageUrl: null }),
    );
  });

  it("fixes an all-caps title the LLM copied from the video", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue(null);
    vi.mocked(fetchTranscriptText).mockResolvedValue("oi gente hoje eu vou fazer...");
    vi.mocked(extractRecipeWithLLM).mockResolvedValue({ ...foundDraft, title: "CORAÇÃO DE BOI ACEBOLADO" });

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft.title).toBe("Coração de boi acebolado");
  });

  it("strips the channel suffix from the video title in the manual-entry fallback", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      title: "CORAÇÃO DE BOI ACEBOLADO// receitas,casa e coisas.",
      description: "",
      thumbnailUrl: null,
    });
    vi.mocked(fetchTranscriptText).mockResolvedValue(null);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft.recipeFound).toBe(false);
    expect(draft.title).toBe("Coração de boi acebolado");
  });

  it("signals manual entry with title/videoUrl prefilled when no recipe is found (SPEC §4.6b step 3)", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      title: "My Vlog",
      description: "just chatting today",
      thumbnailUrl: "https://img.example.com/thumb.jpg",
    });
    vi.mocked(fetchTranscriptText).mockResolvedValue(null);
    vi.mocked(extractRecipeWithLLM).mockResolvedValue({ ...foundDraft, recipeFound: false });

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft.recipeFound).toBe(false);
    expect(draft.title).toBe("My Vlog");
    expect(draft.videoUrl).toBe("https://youtu.be/abc123");
    expect(draft.imageUrl).toBe("https://img.example.com/thumb.jpg");
  });

  it("lets an LLM failure propagate instead of reporting that the video has no recipe", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({ title: "Tomato Pasta", description: "", thumbnailUrl: null });
    vi.mocked(fetchTranscriptText).mockResolvedValue("hey everyone...");
    const error = new LLMExtractionError("OpenRouter request failed (402): insufficient credits");
    vi.mocked(extractRecipeWithLLM).mockRejectedValue(error);

    await expect(importRecipeFromUrl("https://youtu.be/abc123")).rejects.toBe(error);
  });

  it("skips the LLM when there is neither a description nor a transcript", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({ title: "Tomato Pasta", description: "", thumbnailUrl: null });
    vi.mocked(fetchTranscriptText).mockResolvedValue(null);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft.recipeFound).toBe(false);
    expect(extractRecipeWithLLM).not.toHaveBeenCalled();
  });
});
