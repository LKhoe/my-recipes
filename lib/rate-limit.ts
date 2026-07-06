// Simple in-memory sliding-window limiter. SPEC §4.6 asks for per-user rate limiting on the
// import endpoint (the one route that spends money per call) but explicitly rules out a
// job-queue/Redis layer (§8) — this is a single self-hosted process, so an in-memory store is
// enough; it just doesn't survive a restart or scale across instances, which is fine here.
declare global {
  var importRateLimitStore: Map<string, number[]> | undefined;
}

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const store: Map<string, number[]> = globalThis.importRateLimitStore ?? new Map();
globalThis.importRateLimitStore = store;

export function checkImportRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const timestamps = (store.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  timestamps.push(now);
  store.set(userId, timestamps);
  return { allowed: true };
}
