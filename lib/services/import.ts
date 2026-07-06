import { fetchPageHtml, stripToReadableText } from "@/lib/services/html-fetch";
import { extractRecipeFromJsonLd } from "@/lib/services/jsonld";
import { extractRecipeWithLLM } from "@/lib/services/llm";
import { fetchTranscriptText, fetchVideoMetadata, isYouTubeUrl, parseYouTubeVideoId } from "@/lib/services/youtube";
import type { RecipeDraft } from "@/types";

async function importFromWebpage(url: string): Promise<RecipeDraft> {
  const html = await fetchPageHtml(url);

  // SPEC §4.6: JSON-LD first (deterministic, free, instant) — expected to cover most sites.
  const jsonLdDraft = extractRecipeFromJsonLd(html, url);
  if (jsonLdDraft) return jsonLdDraft;

  // Fallback: strip to readable text and hand it to the LLM.
  const text = stripToReadableText(html);
  return extractRecipeWithLLM(text, {
    context: "webpage",
    allowEstimation: false,
    sourceUrl: url,
    videoUrl: null,
  });
}

async function importFromYouTube(url: string): Promise<RecipeDraft> {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Could not parse a video id from that YouTube URL.");
  }

  const metadata = await fetchVideoMetadata(videoId);

  // SPEC §4.6b step 1: video description first — cheapest source.
  if (metadata?.description) {
    const draft = await extractRecipeWithLLM(metadata.description, {
      context: "youtube-description",
      allowEstimation: true,
      sourceUrl: url,
      videoUrl: url,
      imageUrl: metadata.thumbnailUrl,
    }).catch(() => null);
    if (draft?.recipeFound) return draft;
  }

  // SPEC §4.6b step 2: fall back to the transcript.
  const transcript = await fetchTranscriptText(videoId);
  if (transcript) {
    const draft = await extractRecipeWithLLM(transcript, {
      context: "youtube-transcript",
      allowEstimation: true,
      sourceUrl: url,
      videoUrl: url,
      imageUrl: metadata?.thumbnailUrl ?? null,
    }).catch(() => null);
    if (draft?.recipeFound) return draft;
  }

  // SPEC §4.6b step 3: neither yielded a recipe — signal manual entry, title/videoUrl prefilled.
  return {
    recipeFound: false,
    title: metadata?.title ?? "",
    description: null,
    servings: null,
    prepTime: null,
    cookTime: null,
    steps: [],
    ingredients: [],
    sourceUrl: url,
    videoUrl: url,
    imageUrl: metadata?.thumbnailUrl ?? null,
  };
}

export async function importRecipeFromUrl(url: string): Promise<RecipeDraft> {
  if (isYouTubeUrl(url)) return importFromYouTube(url);
  return importFromWebpage(url);
}
