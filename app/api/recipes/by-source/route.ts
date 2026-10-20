import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { findRecipesBySource } from "@/lib/services/recipe";

/** Recipes already imported from a link, checked by the import box before it spends an import. */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url") ?? "";
  return NextResponse.json({ recipes: await findRecipesBySource(url) });
}
