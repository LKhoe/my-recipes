const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 3_000_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; MyRecipesBot/1.0; +https://github.com) recipe-import";

export class PageFetchError extends Error {}

export async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new PageFetchError(`Fetching ${url} failed with status ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      throw new PageFetchError(`URL did not return HTML (content-type: ${contentType})`);
    }

    const reader = res.body?.getReader();
    if (!reader) return await res.text();

    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) {
        await reader.cancel();
        break;
      }
      html += decoder.decode(value, { stream: true });
    }
    return html;
  } catch (err) {
    if (err instanceof PageFetchError) throw err;
    throw new PageFetchError(`Could not fetch ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

const MAX_TEXT_CHARS = 12_000;

/** Strips HTML down to plain readable text for the LLM fallback (SPEC §4.6 step 2). */
export function stripToReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const text = withoutNoise
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, MAX_TEXT_CHARS);
}

function decodeAttribute(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * The page's share image (`og:image`, `twitter:image` or `<link rel="image_src">`), resolved
 * against the page URL. Nearly every recipe site sets one, usually a photo of the dish; used when
 * the JSON-LD has no `image` or the page goes to the LLM, which never returns one.
 */
export function extractMetaImageUrl(html: string, pageUrl: string): string | null {
  const head = html.slice(0, 300_000);
  const candidates: Record<string, string> = {};

  for (const [tag] of head.matchAll(/<(?:meta|link)\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const [, name, , value] of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
      attrs[name.toLowerCase()] = value;
    }
    const key = (attrs.property ?? attrs.name ?? attrs.rel ?? "").toLowerCase();
    const value = attrs.content ?? attrs.href;
    if (value && !(key in candidates)) candidates[key] = value;
  }

  const raw =
    candidates["og:image:secure_url"] ??
    candidates["og:image"] ??
    candidates["og:image:url"] ??
    candidates["twitter:image"] ??
    candidates["twitter:image:src"] ??
    candidates["image_src"];
  return raw ? resolveImageUrl(decodeAttribute(raw.trim()), pageUrl) : null;
}

/** An absolute http(s) URL for an image reference found on a page (it may be relative). */
export function resolveImageUrl(value: string | null, pageUrl: string): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(value, pageUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : null;
  } catch {
    return null;
  }
}
