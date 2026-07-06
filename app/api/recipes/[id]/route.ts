import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRecipeById, softDeleteRecipe, updateRecipe } from "@/lib/services/recipe";
import { recipeInputSchema } from "@/lib/validation";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const recipeDetail = await getRecipeById(id);
  if (!recipeDetail) {
    return NextResponse.json({ error: "Receita não encontrada" }, { status: 404 });
  }

  return NextResponse.json(recipeDetail);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await getRecipeById(id);
  if (!existing) {
    return NextResponse.json({ error: "Receita não encontrada" }, { status: 404 });
  }

  const parsed = recipeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados da receita inválidos." }, { status: 400 });
  }

  await updateRecipe(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await softDeleteRecipe(id, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Receita não encontrada, ou você não é o autor dela." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
