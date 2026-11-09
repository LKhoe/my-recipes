// Pure parts of the recipe title search (the SQL lives in lib/services/recipe-search.ts). Shared
// by the web list and the Alexa skill so both treat a query the same way.

/** Longest query we search for; anything beyond is cut (also bounds the trigram work). */
export const MAX_SEARCH_QUERY_LENGTH = 100;

/**
 * Minimum pg_trgm `word_similarity` for a title to count as a match. Below it, hits are mostly noise
 * ("bolo" vs "molho"). A title that contains the query always matches, whatever its score.
 */
export const SEARCH_SIMILARITY_THRESHOLD = 0.35;

/** Whole-title `similarity` threshold for the reverse case (the query is longer than the title). */
export const SEARCH_WHOLE_SIMILARITY_THRESHOLD = 0.45;

/** Alexa starts a recipe on its own only when the best match scores at least this... */
export const AUTO_START_MIN_SCORE = 0.7;
/** ...and beats the runner-up by at least this much; otherwise she offers the list. */
export const AUTO_START_MIN_MARGIN = 0.15;

/** Trims, collapses whitespace and caps the length. Case and accents are folded by the database. */
export function cleanSearchQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
}

/** Escapes `\`, `%` and `_` so a user's text is matched literally inside a LIKE pattern. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Lower-cased, accent-free form: the JS twin of f_unaccent(lower(x)), for comparisons in code. */
export function foldForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type ScoredMatch = { score: number };

/**
 * The match Alexa may start without asking: the top one when it is a strong match and clearly
 * ahead of the next. Ties ("Cheesecake" and "Cheesecake de frutas") return null and go to the list.
 * Matches must already be ordered best first; a missing score never auto-starts.
 */
export function pickConfidentMatch<T extends ScoredMatch>(matches: T[]): T | null {
  const [best, next] = matches;
  if (!best || typeof best.score !== "number" || best.score < AUTO_START_MIN_SCORE) return null;
  if (next && typeof next.score === "number" && best.score - next.score < AUTO_START_MIN_MARGIN) return null;
  return best;
}
