import { cleanImportedIngredients, cleanRecipeTitle, removeBrands } from "@/lib/import-cleanup";
import { extractMetaImageUrl, fetchPageHtml, resolveImageUrl, stripToReadableText } from "@/lib/services/html-fetch";
import { extractRecipeFromJsonLd } from "@/lib/services/jsonld";
import type { LLMTier } from "@/lib/llm-tiers";
import { extractRecipeWithLLM } from "@/lib/services/llm";
import {
  CaptionsBlockedError,
  fetchTranscriptText,
  fetchVideoMetadata,
  isYouTubeUrl,
  parseYouTubeVideoId,
} from "@/lib/services/youtube";
import { cleanVideoTitle } from "@/lib/youtube-utils";
import type { RecipeDraft } from "@/types";

/**
 * The last word on every draft, whichever path made it: no "Receita de" in the title, no brands,
 * no leading "de" on ingredient names, and "manteiga ou margarina" split into an option (see
 * lib/import-cleanup.ts).
 */
export function finalizeDraft(draft: RecipeDraft): RecipeDraft {
  if (!draft.recipeFound) return { ...draft, title: cleanRecipeTitle(draft.title) };
  return {
    ...draft,
    title: cleanRecipeTitle(removeBrands(draft.title)),
    steps: draft.steps.map((step) => ({ ...step, text: removeBrands(step.text) })),
    ingredients: cleanImportedIngredients(draft.ingredients),
  };
}

async function importFromWebpage(url: string, tier?: LLMTier): Promise<RecipeDraft> {
  const html = await fetchPageHtml(url);
  // The share image is the fallback photo: JSON-LD sometimes has none, the LLM never returns one.
  const metaImageUrl = extractMetaImageUrl(html, url);

  // SPEC §4.6: JSON-LD first (deterministic, free, instant) — expected to cover most sites.
  const jsonLdDraft = extractRecipeFromJsonLd(html, url);
  if (jsonLdDraft) {
    return { ...jsonLdDraft, imageUrl: resolveImageUrl(jsonLdDraft.imageUrl, url) ?? metaImageUrl };
  }

  // Fallback: strip to readable text and hand it to the LLM.
  const text = stripToReadableText(html);
  return extractRecipeWithLLM(text, {
    context: "webpage",
    allowEstimation: false,
    sourceUrl: url,
    videoUrl: null,
    imageUrl: metaImageUrl,
    tier,
  });
}

export type ImportOptions = {
  /** Which LLM tier reads the page or video when there's no JSON-LD (the user's choice on import). */
  tier?: LLMTier;
  /**
   * Throw CaptionsBlockedError instead of going on with the description alone when YouTube blocks
   * the captions. The queue sets it: the method is usually in the captions, so it waits and tries
   * again rather than spending an LLM call on a recipe without one.
   */
  failOnBlockedCaptions?: boolean;
};

const BLOCKED_CAPTIONS_WARNING =
  "O YouTube bloqueou temporariamente as legendas, então a receita foi lida só da descrição do vídeo. Confira o modo de preparo.";

async function importFromYouTube(url: string, opts: ImportOptions): Promise<RecipeDraft> {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Could not parse a video id from that YouTube URL.");
  }

  // SPEC §4.6b: description and transcript go to the LLM together, in one call — the description
  // often has the exact quantities, the transcript the method.
  let captionsBlocked = false;
  const [metadata, transcript] = await Promise.all([
    fetchVideoMetadata(videoId),
    fetchTranscriptText(videoId).catch((err) => {
      if (!(err instanceof CaptionsBlockedError) || opts.failOnBlockedCaptions) throw err;
      captionsBlocked = true;
      return null;
    }),
  ]);
  const warning = captionsBlocked ? BLOCKED_CAPTIONS_WARNING : null;

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
      tier: opts.tier,
    });
    // The prompt asks for a sentence-case title, but the model sometimes copies an all-caps video
    // title as-is.
    if (draft.recipeFound) return { ...draft, title: cleanVideoTitle(draft.title || metadata?.title || ""), warning };
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
    warning,
  };
}

export async function importRecipeFromUrl(url: string, opts: ImportOptions = {}): Promise<RecipeDraft> {
  const draft = isYouTubeUrl(url) ? await importFromYouTube(url, opts) : await importFromWebpage(url, opts.tier);
  return finalizeDraft(draft);
}
