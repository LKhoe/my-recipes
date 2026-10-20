import { eq } from "drizzle-orm";
import { Innertube, Log } from "youtubei.js";
import { db } from "@/lib/db";
import { videoTranscript } from "@/lib/db/schema";

export { parseYouTubeVideoId, isYouTubeUrl } from "@/lib/youtube-utils";

export class YouTubePlaylistError extends Error {}

/**
 * YouTube answered the caption download with 429 and its "Sorry…" anti-bot page: the server's IP
 * is temporarily blocked from captions (the video itself still loads). Happened after ~12 caption
 * downloads in 3.5 minutes during a playlist import; it lasts hours.
 */
export class CaptionsBlockedError extends Error {}

// YouTube blocked this server's IP after ~12 caption downloads in 3.5 minutes, so no two downloads
// start closer than this, whoever asks (a queued video or someone importing by hand).
export const CAPTION_REQUEST_SPACING_MS = 15_000;

type CaptionThrottle = { nextAt: number };
declare global {
  var captionThrottle: CaptionThrottle | undefined;
}
// On globalThis: instrumentation.ts (the queue) and the route handlers are separate bundles.
const captionThrottle: CaptionThrottle = (globalThis.captionThrottle ??= { nextAt: 0 });

/** Waits for this caller's turn; concurrent callers line up CAPTION_REQUEST_SPACING_MS apart. */
async function waitForCaptionSlot(): Promise<void> {
  const slot = Math.max(Date.now(), captionThrottle.nextAt);
  captionThrottle.nextAt = slot + CAPTION_REQUEST_SPACING_MS;
  const wait = slot - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function readCachedTranscript(videoId: string): Promise<string | null> {
  try {
    const [row] = await db.select({ text: videoTranscript.text }).from(videoTranscript).where(eq(videoTranscript.videoId, videoId));
    return row?.text ?? null;
  } catch (err) {
    console.warn(`[youtube] ${videoId}: transcript cache read failed:`, err);
    return null;
  }
}

async function cacheTranscript(videoId: string, text: string): Promise<void> {
  try {
    await db.insert(videoTranscript).values({ videoId, text }).onConflictDoNothing();
  } catch (err) {
    console.warn(`[youtube] ${videoId}: transcript cache write failed:`, err);
  }
}

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

export type PlaylistVideo = { videoId: string; title: string; thumbnailUrl: string | null };
export type YouTubePlaylist = { playlistId: string; title: string; videos: PlaylistVideo[] };

// Enough for any cooking playlist; the Data API pages 50 at a time (1 quota unit per page).
export const MAX_PLAYLIST_VIDEOS = 200;

// Deleted and private videos stay in a playlist as placeholders with no thumbnail.
const UNAVAILABLE_VIDEO_TITLES = new Set(["Deleted video", "Private video", "Vídeo excluído", "Vídeo privado"]);

async function dataApiGet(path: string, params: Record<string, string>) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new YouTubePlaylistError("A chave da API do YouTube (YOUTUBE_API_KEY) não está configurada.");

  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    console.warn(`[youtube] ${path}: Data API request failed:`, err);
    throw new YouTubePlaylistError("Não foi possível falar com o YouTube. Tente de novo.");
  }
  if (res.status === 404) throw new YouTubePlaylistError("Playlist não encontrada. Ela é pública?");
  if (!res.ok) {
    console.warn(`[youtube] ${path}: Data API request failed (HTTP ${res.status})`);
    throw new YouTubePlaylistError("O YouTube recusou o pedido da playlist. Tente de novo mais tarde.");
  }
  return res.json();
}

/** A public or unlisted playlist's title and videos, in playlist order, via the Data API. */
export async function fetchPlaylist(playlistId: string): Promise<YouTubePlaylist> {
  const meta = await dataApiGet("playlists", { part: "snippet", id: playlistId });
  const snippet = meta?.items?.[0]?.snippet;
  if (!snippet) throw new YouTubePlaylistError("Playlist não encontrada. Ela é pública?");

  const videos: PlaylistVideo[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await dataApiGet("playlistItems", {
      part: "snippet",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page?.items ?? []) {
      const videoId: string | undefined = item?.snippet?.resourceId?.videoId;
      const title: string = item?.snippet?.title ?? "";
      if (!videoId || seen.has(videoId) || UNAVAILABLE_VIDEO_TITLES.has(title)) continue;
      seen.add(videoId);
      videos.push({ videoId, title, thumbnailUrl: pickListThumbnailUrl(item.snippet.thumbnails) });
    }
    pageToken = page?.nextPageToken;
  } while (pageToken && videos.length < MAX_PLAYLIST_VIDEOS);

  return { playlistId, title: snippet.title ?? "", videos: videos.slice(0, MAX_PLAYLIST_VIDEOS) };
}

/** A small thumbnail for a list row (320x180 `medium` is true 16:9); falls back to any size. */
function pickListThumbnailUrl(thumbnails: Thumbnails | undefined): string | null {
  return thumbnails?.medium?.url ?? pickThumbnailUrl(thumbnails);
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
 * A transcript is downloaded once (video_transcript) and downloads are CAPTION_REQUEST_SPACING_MS
 * apart. Throws CaptionsBlockedError when YouTube blocks the download; any other failure is null.
 */
export async function fetchTranscriptText(videoId: string): Promise<string | null> {
  const cached = await readCachedTranscript(videoId);
  if (cached) return cached;

  try {
    await waitForCaptionSlot();
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
    if (res.status === 429) {
      throw new CaptionsBlockedError("O YouTube bloqueou temporariamente o acesso às legendas.");
    }
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
    await cacheTranscript(videoId, text);
    return text;
  } catch (err) {
    if (err instanceof CaptionsBlockedError) {
      console.warn(`[youtube] ${videoId}: captions blocked (HTTP 429)`);
      throw err;
    }
    console.warn(`[youtube] ${videoId}: transcript fetch failed:`, err);
    return null;
  }
}
