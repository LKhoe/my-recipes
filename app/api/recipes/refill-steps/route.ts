import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { DEFAULT_LLM_TIER, LLM_TIERS } from "@/lib/llm-tiers";
import { MAX_BATCH_VIDEOS, queueStepsRefill } from "@/lib/services/import-queue";

const bodySchema = z.object({
  recipeIds: z.array(z.string()).min(1).max(MAX_BATCH_VIDEOS),
  tier: z.enum(LLM_TIERS).default(DEFAULT_LLM_TIER),
});

/**
 * "Buscar modo de preparo": queues the video of each of the user's recipes that has no method, to
 * fill it in. Only the author's own recipes from YouTube are taken, since each one is an LLM call.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escolha ao menos uma receita." }, { status: 400 });
  }

  const queued = await queueStepsRefill(session.user.id, parsed.data.recipeIds, parsed.data.tier);
  if (queued === 0) {
    return NextResponse.json(
      { error: "Nenhuma receita sua de vídeo do YouTube está sem modo de preparo." },
      { status: 400 },
    );
  }
  return NextResponse.json({ queued }, { status: 201 });
}
