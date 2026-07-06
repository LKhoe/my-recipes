import { NextRequest } from "next/server";

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

  return header.slice("Bearer ".length) === expectedToken;
}
