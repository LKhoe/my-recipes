// Pure, client-safe (no Node imports): one key per recipe source, so the same page or video is
// recognised however its link was written ("youtu.be/X", "youtube.com/watch?v=X&t=30",
// "http://www.site.com/receita/?utm_source=…").
import { parseYouTubeVideoId } from "@/lib/youtube-utils";

// Tracking parameters that don't change which page it is.
const TRACKING_PARAM = /^(?:utm_\w+|fbclid|gclid|igshid|mc_\w+|ref|si)$/i;

/** "yt:<videoId>" for a YouTube video, "<host><path>?<query>" for a page; null for a non-http link. */
export function sourceKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const videoId = parseYouTubeVideoId(url);
  if (videoId) return `yt:${videoId}`;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^(?:www|m|amp)\./, "");
  const path = parsed.pathname.replace(/\/+$/, "").replace(/\/amp$/, "") || "/";
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${host}${path}${params ? `?${params}` : ""}`;
}
