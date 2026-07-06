import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkImportRateLimit } from "@/lib/rate-limit";
import { importRecipeFromUrl } from "@/lib/services/import";
import { PageFetchError } from "@/lib/services/html-fetch";
import { LLMExtractionError } from "@/lib/services/llm";

// LLM extraction can take 30-60s (SPEC §4.6 operational constraints).
export const maxDuration = 60;

const bodySchema = z.object({ url: z.string().url() });

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkImportRateLimit(session.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many imports. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "A valid URL is required." }, { status: 400 });
  }

  try {
    const draft = await importRecipeFromUrl(parsedBody.data.url);
    return NextResponse.json(draft);
  } catch (err) {
    if (err instanceof PageFetchError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof LLMExtractionError) {
      return NextResponse.json({ error: `Could not extract a recipe: ${err.message}` }, { status: 502 });
    }
    console.error("Recipe import failed:", err);
    return NextResponse.json({ error: "Import failed unexpectedly." }, { status: 500 });
  }
}
