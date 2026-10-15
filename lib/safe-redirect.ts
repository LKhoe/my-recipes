// Validates the ?redirect= param on /login so a crafted link can't send a freshly signed-in
// user off-site (e.g. /login?redirect=https://evil.example). Pure and dependency-free so the
// client-side LoginForm can import it.

const DEFAULT_REDIRECT = "/recipes";

// Any absolute URL works as the base: we only need to know whether resolving `value` against
// it stays on that origin.
const BASE = "http://same-origin.invalid";

export function safeRedirectPath(value: string | null | undefined, fallback = DEFAULT_REDIRECT): string {
  if (!value) return fallback;

  // "//host" and "/\host" are protocol-relative to browsers (they treat "\" as "/").
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // The URL parser also strips tabs/newlines ("/\t/evil.example" → "//evil.example"), so check
  // the origin it actually resolves to rather than trusting the prefix test alone.
  let parsed: URL;
  try {
    parsed = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== BASE) return fallback;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
