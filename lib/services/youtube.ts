import { Innertube } from "youtubei.js";

export function parseYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const shortsMatch = parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
      if (shortsMatch) return shortsMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string): boolean {
  return parseYouTubeVideoId(url) !== null;
}

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
