import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./html-fetch", () => ({
  fetchPageHtml: vi.fn(),
  stripToReadableText: vi.fn((html: string) => `stripped:${html}`),
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
  isYouTubeUrl: vi.fn(),
  parseYouTubeVideoId: vi.fn(),
  fetchVideoMetadata: vi.fn(),
  fetchTranscriptText: vi.fn(),
}));

import { fetchPageHtml, stripToReadableText } from "./html-fetch";
import { extractRecipeFromJsonLd } from "./jsonld";
import { extractRecipeWithLLM, LLMExtractionError } from "./llm";
import { fetchTranscriptText, fetchVideoMetadata, isYouTubeUrl, parseYouTubeVideoId } from "./youtube";
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

    expect(draft).toBe(foundDraft);
    expect(extractRecipeWithLLM).not.toHaveBeenCalled();
  });

  it("falls back to the LLM over stripped page text when JSON-LD is missing", async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue("<html>no structured data</html>");
    vi.mocked(extractRecipeFromJsonLd).mockReturnValue(null);
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    const draft = await importRecipeFromUrl("https://example.com/blog-post");

    expect(draft).toBe(foundDraft);
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

    expect(draft).toEqual(foundDraft);
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

  it("uses the transcript alone when there is no metadata (no API key)", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue(null);
    vi.mocked(fetchTranscriptText).mockResolvedValue("hey everyone... a glug of olive oil ...");
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft).toEqual(foundDraft);
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
