import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createRecipe, listRecipes } from "@/lib/services/recipe";
import { recipeInputSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const recipes = await listRecipes({
    q: params.get("q") ?? undefined,
    categoryId: params.get("categoryId") ?? undefined,
    tag: params.get("tag") ?? undefined,
    ingredient: params.get("ingredient") ?? undefined,
  });
  return NextResponse.json(recipes);
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = recipeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados da receita inválidos." }, { status: 400 });
  }

  const created = await createRecipe(session.user.id, parsed.data);
  return NextResponse.json(created, { status: 201 });
}
