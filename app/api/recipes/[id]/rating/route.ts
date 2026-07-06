import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { clearUserRating, getUserRating, setUserRating } from "@/lib/services/rating";

const bodySchema = z.object({ score: z.number().int().min(1).max(5).nullable() });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const score = await getUserRating(session.user.id, id);
  return NextResponse.json({ score });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "score deve ser um número inteiro de 1 a 5, ou null" }, { status: 400 });
  }

  if (parsed.data.score === null) {
    await clearUserRating(session.user.id, id);
  } else {
    await setUserRating(session.user.id, id, parsed.data.score);
  }

  return NextResponse.json({ ok: true });
}
