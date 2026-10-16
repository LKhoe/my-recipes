import { Innertube, Log } from "youtubei.js";

export { parseYouTubeVideoId, isYouTubeUrl } from "@/lib/youtube-utils";

export type YouTubeVideoMetadata = {
  title: string;
  description: string;
  thumbnailUrl: string | null;
};

/** SPEC §4.6b — title, description and thumbnail from the Data API's free quota, no scraping. */
export async function fetchVideoMetadata(videoId: string): Promise<YouTubeVideoMetadata | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  let json;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[youtube] ${videoId}: Data API request failed (HTTP ${res.status})`);
      return null;
    }
    json = await res.json();
  } catch (err) {
    console.warn(`[youtube] ${videoId}: Data API request failed:`, err);
    return null;
  }

  const snippet = json?.items?.[0]?.snippet;
  if (!snippet) {
    console.warn(`[youtube] ${videoId}: the Data API returned no such video`);
    return null;
  }

  return {
    title: snippet.title ?? "",
    description: snippet.description ?? "",
    thumbnailUrl: pickThumbnailUrl(snippet.thumbnails),
  };
}

type Thumbnails = Partial<Record<"maxres" | "standard" | "high" | "medium" | "default", { url?: string }>>;

/**
 * The largest thumbnail the video has. Only `maxres` (1280x720) is 16:9; `standard` (640x480) and
 * `high` (480x360) are 4:3 frames with black bars around the picture. `maxres` and `standard` are
 * missing for some videos, `high` never is.
 */
export function pickThumbnailUrl(thumbnails: Thumbnails | undefined): string | null {
  const sizes = ["maxres", "standard", "high", "medium", "default"] as const;
  for (const size of sizes) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return null;
}

let innertubePromise: Promise<Innertube> | null = null;
function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    // youtubei.js logs a long parser warning (with stack trace) for every page element it
    // doesn't recognise yet; our own warnings below cover the failures that matter.
    Log.setLevel(Log.Level.ERROR);
    innertubePromise = Innertube.create();
  }
  return innertubePromise;
}

type CaptionTrack = { base_url: string; language_code: string; kind?: string };

/** Prefers Portuguese, then a creator-made track over an auto-generated ("asr") one. */
export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const isPortuguese = (track: CaptionTrack) => track.language_code.toLowerCase().startsWith("pt");
  const isManual = (track: CaptionTrack) => track.kind !== "asr";
  return (
    tracks.find((t) => isPortuguese(t) && isManual(t)) ??
    tracks.find(isPortuguese) ??
    tracks.find(isManual) ??
    tracks[0] ??
    null
  );
}

/** Joins the text of a caption file in YouTube's `json3` format into one line. */
export function parseJson3Captions(json: { events?: { segs?: { utf8?: string }[] }[] }): string {
  return (json.events ?? [])
    .flatMap((event) => event.segs ?? [])
    .map((seg) => seg.utf8 ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SPEC §4.6b — the video's captions (auto-generated ones exist for most videos), no API key, no
 * audio processing. Reads the caption track directly: Innertube's `get_transcript` endpoint
 * (`info.getTranscript()`) now answers HTTP 400, and the WEB client's caption URLs need a PO token
 * (they return an empty body without one). The ANDROID client's caption URLs work as-is.
 */
export async function fetchTranscriptText(videoId: string): Promise<string | null> {
  try {
    const youtube = await getInnertube();
    const info = await youtube.getBasicInfo(videoId, { client: "ANDROID" });
    const track = pickCaptionTrack(info.captions?.caption_tracks ?? []);
    if (!track) {
      console.warn(`[youtube] ${videoId}: the video has no captions`);
      return null;
    }

    const captionsUrl = new URL(track.base_url);
    captionsUrl.searchParams.set("fmt", "json3");
    const res = await fetch(captionsUrl);
    const body = res.ok ? await res.text() : "";
    if (!body) {
      console.warn(`[youtube] ${videoId}: caption download failed (HTTP ${res.status}, ${body.length} bytes)`);
      return null;
    }

    const text = parseJson3Captions(JSON.parse(body));
    if (!text) {
      console.warn(`[youtube] ${videoId}: the ${track.language_code} caption track is empty`);
      return null;
    }
    return text;
  } catch (err) {
    console.warn(`[youtube] ${videoId}: transcript fetch failed:`, err);
    return null;
  }
}
