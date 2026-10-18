import { fetchPageHtml, stripToReadableText } from "@/lib/services/html-fetch";
import { extractRecipeFromJsonLd } from "@/lib/services/jsonld";
import type { LLMTier } from "@/lib/llm-tiers";
import { extractRecipeWithLLM } from "@/lib/services/llm";
import { fetchTranscriptText, fetchVideoMetadata, isYouTubeUrl, parseYouTubeVideoId } from "@/lib/services/youtube";
import { cleanVideoTitle } from "@/lib/youtube-utils";
import type { RecipeDraft } from "@/types";

async function importFromWebpage(url: string, tier?: LLMTier): Promise<RecipeDraft> {
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
    tier,
  });
}

async function importFromYouTube(url: string, tier?: LLMTier): Promise<RecipeDraft> {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Could not parse a video id from that YouTube URL.");
  }

  // SPEC §4.6b: description and transcript go to the LLM together, in one call — the description
  // often has the exact quantities, the transcript the method.
  const [metadata, transcript] = await Promise.all([fetchVideoMetadata(videoId), fetchTranscriptText(videoId)]);

  if (metadata?.description || transcript) {
    const sections = [
      metadata?.title && `Title: ${metadata.title}`,
      metadata?.description && `Description:\n${metadata.description}`,
      transcript && `Transcript:\n${transcript}`,
    ].filter(Boolean);

    // An LLMExtractionError (OpenRouter down, out of credits, bad JSON) propagates: the route
    // reports it as a failed import. Only the model's own "no recipe" answer falls back to manual
    // entry, or the user is told the video has no recipe when it was never read.
    const draft = await extractRecipeWithLLM(sections.join("\n\n"), {
      context: "youtube",
      allowEstimation: true,
      sourceUrl: url,
      videoUrl: url,
      imageUrl: metadata?.thumbnailUrl ?? null,
      tier,
    });
    // The prompt asks for a sentence-case title, but the model sometimes copies an all-caps video
    // title as-is.
    if (draft.recipeFound) return { ...draft, title: cleanVideoTitle(draft.title || metadata?.title || "") };
    console.warn(`[import] ${videoId}: no recipe in the video's description or transcript`);
  } else {
    console.warn(`[import] ${videoId}: neither a description nor a transcript is available`);
  }

  // SPEC §4.6b step 3: no recipe found — signal manual entry, title/videoUrl prefilled.
  return {
    recipeFound: false,
    title: cleanVideoTitle(metadata?.title ?? ""),
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

// tier: which LLM tier reads the page when it has no JSON-LD (the user's choice on import)
export async function importRecipeFromUrl(url: string, opts: { tier?: LLMTier } = {}): Promise<RecipeDraft> {
  if (isYouTubeUrl(url)) return importFromYouTube(url, opts.tier);
  return importFromWebpage(url, opts.tier);
}
