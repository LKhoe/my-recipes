import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addTip, listTips } from "@/lib/services/tip";

const bodySchema = z.object({
  body: z.string().min(1).max(1000),
  stepIndex: z.number().int().min(0).nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: recipeId } = await params;
  const tips = await listTips(recipeId);
  return NextResponse.json(tips);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: recipeId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A dica é obrigatória." }, { status: 400 });
  }

  try {
    const created = await addTip(recipeId, session.user.id, parsed.data.body, parsed.data.stepIndex ?? null);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao salvar a dica.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
