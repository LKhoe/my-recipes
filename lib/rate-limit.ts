// Simple in-memory sliding-window limiter. SPEC §4.6 asks for per-user rate limiting on the
// import endpoint (the one route that spends money per call) but explicitly rules out a
// job-queue/Redis layer (§8) — this is a single self-hosted process, so an in-memory store is
// enough; it just doesn't survive a restart or scale across instances, which is fine here.
declare global {
  var importRateLimitStore: Map<string, number[]> | undefined;
}

const WINDOW_MS = 60 * 60 * 1000;

// Keyed by `${limiter}:${userId}`, so each limiter counts on its own.
const store: Map<string, number[]> = globalThis.importRateLimitStore ?? new Map();
globalThis.importRateLimitStore = store;

function checkRateLimit(
  limiter: string,
  userId: string,
  maxPerWindow: number,
): { allowed: boolean; retryAfterSeconds?: number } {
  const key = `${limiter}:${userId}`;
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= maxPerWindow) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true };
}

export function checkImportRateLimit(userId: string) {
  return checkRateLimit("import", userId, 10);
}

// "Não tenho" on the web: free models, but each call still holds a slot on the gateway.
export function checkSubstitutionRateLimit(userId: string) {
  return checkRateLimit("substitution", userId, 30);
}
