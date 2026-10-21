import { SkillRequestSignatureVerifier, TimestampVerifier } from "ask-sdk-express-adapter";

// Amazon's own checks for a skill hosted as a web service: the Signature-256 header against the
// certificate chain Amazon points to, and a request timestamp at most 150 s old (replay window).
const signatureVerifier = new SkillRequestSignatureVerifier();
const timestampVerifier = new TimestampVerifier();

/**
 * Local testing only: `ALEXA_SKIP_VERIFICATION=1` lets hand-made request envelopes through with
 * curl. Never honored in production, where every request must be signed by Amazon.
 */
export function verificationDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALEXA_SKIP_VERIFICATION === "1";
}

/** Throws when the request didn't come from Alexa. `body` must be the raw, unparsed body. */
export async function verifyAlexaRequest(body: string, headers: Headers): Promise<void> {
  if (verificationDisabled()) return;
  const plainHeaders = Object.fromEntries(headers.entries());
  await signatureVerifier.verify(body, plainHeaders);
  await timestampVerifier.verify(body);
}
