import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkSubstitutionRateLimit } from "@/lib/rate-limit";
import { LLMExtractionError, LLMLimitError } from "@/lib/services/llm";
import { suggestSubstitutes } from "@/lib/services/substitution";

const bodySchema = z.object({
  ingredientName: z.string().trim().min(1).max(200),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ingredientName é obrigatório" }, { status: 400 });
  }

  const rateLimit = checkSubstitutionRateLimit(session.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitos pedidos de substituição. Tente de novo daqui a pouco." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const { id: recipeId } = await params;
  try {
    const result = await suggestSubstitutes(recipeId, parsed.data.ingredientName);
    if (!result) {
      return NextResponse.json({ error: "Receita não encontrada." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LLMLimitError) {
      return NextResponse.json({ error: `Não deu para buscar substitutos: ${err.message}` }, { status: 429 });
    }
    if (err instanceof LLMExtractionError) {
      return NextResponse.json({ error: "A IA não respondeu agora. Tente de novo." }, { status: 502 });
    }
    throw err;
  }
}
