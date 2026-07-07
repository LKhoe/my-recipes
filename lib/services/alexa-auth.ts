import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

// Hashing both sides to a fixed-length SHA-256 digest before comparing means timingSafeEqual
// never has to reject on a length mismatch (it throws if the two buffers differ in length,
// which a raw token comparison can't guarantee) and the digest length reveals nothing about the
// raw token's length either.
function safeCompare(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * SPEC §9.1: the `/api/alexa/*` surface is "thin, token-authenticated" — but §9.2's per-device
 * PIN pairing (the `AlexaDevice` table) is explicitly future work, not shipped in v1. Until that
 * exists there is no per-device identity to check, so v1 authenticates with a single shared
 * secret (`ALEXA_API_TOKEN`) presented as a Bearer token. Every circle member's Echo would use
 * the same token; that's an acceptable v1 simplification for a private single-household app.
 */
export function isAuthorizedAlexaRequest(request: NextRequest): boolean {
  const expectedToken = process.env.ALEXA_API_TOKEN;
  if (!expectedToken) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  return safeCompare(header.slice("Bearer ".length), expectedToken);
}
