// Pure helpers, deliberately dependency-free (no youtubei.js) so it's safe to import from
// client components (lib/services/youtube.ts pulls in Innertube, which is server-only weight).

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

// Lists that aren't a fixed set of videos someone made: "RD…" mixes are generated per viewer,
// "LL"/"WL"/"UL…" are a user's private liked/watch-later lists, which the API won't return.
const NON_PLAYLIST_LIST_ID = /^(?:RD|UL|LL$|WL$)/;

/**
 * The playlist id of a YouTube link: `youtube.com/playlist?list=…`, or a video watched inside a
 * playlist (`watch?v=…&list=…`). Null for anything else, including auto-generated mixes.
 */
export function parseYouTubePlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^(?:www|m|music)\./, "");
    if (host !== "youtube.com" && host !== "youtu.be") return null;
    const list = parsed.searchParams.get("list");
    if (!list || NON_PLAYLIST_LIST_ID.test(list) || !/^[\w-]+$/.test(list)) return null;
    return list;
  } catch {
    return null;
  }
}

/** A playlist page link (`/playlist?list=…`), as opposed to a single video that sits in one. */
export function isYouTubePlaylistPage(url: string): boolean {
  try {
    return new URL(url).pathname === "/playlist" && parseYouTubePlaylistId(url) !== null;
  } catch {
    return false;
  }
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * A video title as a recipe title: drops the channel suffix after "//" or "|" ("CORAÇÃO DE BOI
 * ACEBOLADO// receitas,casa e coisas." -> "CORAÇÃO DE BOI ACEBOLADO") and turns an all-caps title
 * into sentence case ("Coração de boi acebolado"). A title that is not mostly capitals keeps its
 * casing, since it may hold proper nouns.
 */
export function cleanVideoTitle(title: string): string {
  const withoutSuffix = title.split(/\/\/|\|/)[0].trim().replace(/[\s.,;:!-]+$/, "");
  const cleaned = withoutSuffix || title.trim();

  const letters = cleaned.match(/\p{L}/gu) ?? [];
  const capitals = cleaned.match(/\p{Lu}/gu) ?? [];
  if (letters.length < 3 || capitals.length / letters.length < 0.7) return cleaned;

  return cleaned.toLocaleLowerCase("pt-BR").replace(/\p{L}/u, (first) => first.toLocaleUpperCase("pt-BR"));
}
