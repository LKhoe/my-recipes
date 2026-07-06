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
