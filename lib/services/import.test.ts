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
import { extractRecipeWithLLM } from "./llm";
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

  it("uses the video description and skips the transcript when it yields a recipe", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      title: "Tomato Pasta",
      description: "recipe in the description",
      thumbnailUrl: "https://img.example.com/thumb.jpg",
    });
    vi.mocked(extractRecipeWithLLM).mockResolvedValue(foundDraft);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft).toBe(foundDraft);
    expect(extractRecipeWithLLM).toHaveBeenCalledTimes(1);
    expect(extractRecipeWithLLM).toHaveBeenCalledWith(
      "recipe in the description",
      expect.objectContaining({ context: "youtube-description", allowEstimation: true }),
    );
    expect(fetchTranscriptText).not.toHaveBeenCalled();
  });

  it("falls back to the transcript when the description has no usable recipe", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      title: "Tomato Pasta",
      description: "check out my channel, new video every week!",
      thumbnailUrl: null,
    });
    vi.mocked(extractRecipeWithLLM)
      .mockResolvedValueOnce({ ...foundDraft, recipeFound: false })
      .mockResolvedValueOnce(foundDraft);
    vi.mocked(fetchTranscriptText).mockResolvedValue("hey everyone... a glug of olive oil ...");

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft).toBe(foundDraft);
    expect(extractRecipeWithLLM).toHaveBeenCalledTimes(2);
    expect(extractRecipeWithLLM).toHaveBeenLastCalledWith(
      "hey everyone... a glug of olive oil ...",
      expect.objectContaining({ context: "youtube-transcript", allowEstimation: true }),
    );
  });

  it("signals manual entry with title/videoUrl prefilled when nothing yields a recipe (SPEC §4.6b step 3)", async () => {
    vi.mocked(isYouTubeUrl).mockReturnValue(true);
    vi.mocked(parseYouTubeVideoId).mockReturnValue("abc123");
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      title: "My Vlog",
      description: "just chatting today",
      thumbnailUrl: "https://img.example.com/thumb.jpg",
    });
    vi.mocked(extractRecipeWithLLM).mockResolvedValue({ ...foundDraft, recipeFound: false });
    vi.mocked(fetchTranscriptText).mockResolvedValue(null);

    const draft = await importRecipeFromUrl("https://youtu.be/abc123");

    expect(draft.recipeFound).toBe(false);
    expect(draft.title).toBe("My Vlog");
    expect(draft.videoUrl).toBe("https://youtu.be/abc123");
    expect(draft.imageUrl).toBe("https://img.example.com/thumb.jpg");
  });
});
