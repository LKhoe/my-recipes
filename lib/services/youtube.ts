import { Innertube } from "youtubei.js";

export { parseYouTubeVideoId, isYouTubeUrl } from "@/lib/youtube-utils";

export type YouTubeVideoMetadata = {
  title: string;
  description: string;
  thumbnailUrl: string | null;
};

/** SPEC §4.6b step 1 — cheapest source first: the Data API's free quota, no scraping. */
export async function fetchVideoMetadata(videoId: string): Promise<YouTubeVideoMetadata | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) return null;

  const json = await res.json();
  const snippet = json?.items?.[0]?.snippet;
  if (!snippet) return null;

  return {
    title: snippet.title ?? "",
    description: snippet.description ?? "",
    thumbnailUrl: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? null,
  };
}

let innertubePromise: Promise<Innertube> | null = null;
function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) innertubePromise = Innertube.create();
  return innertubePromise;
}

/** SPEC §4.6b step 2 — auto-generated captions via Innertube, no API key, no audio processing. */
export async function fetchTranscriptText(videoId: string): Promise<string | null> {
  try {
    const youtube = await getInnertube();
    const info = await youtube.getInfo(videoId);
    const transcriptInfo = await info.getTranscript();

    const segments = transcriptInfo?.transcript?.content?.body?.initial_segments ?? [];
    const lines = segments
      .filter((segment): segment is typeof segment & { snippet: { toString(): string } } => "snippet" in segment)
      .map((segment) => segment.snippet.toString().trim())
      .filter(Boolean);

    if (lines.length === 0) return null;
    return lines.join(" ");
  } catch {
    return null;
  }
}
