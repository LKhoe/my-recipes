import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAlexaRequest } from "@/lib/services/alexa-auth";
import { getActiveRecipeIngredientQuantity } from "@/lib/services/kitchen";

export async function GET(request: NextRequest) {
  if (!isAuthorizedAlexaRequest(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const ingredientQuery = request.nextUrl.searchParams.get("ingredient");
  if (!ingredientQuery) {
    return NextResponse.json({ error: "O parâmetro ingredient é obrigatório" }, { status: 400 });
  }

  const result = await getActiveRecipeIngredientQuantity(ingredientQuery);
  if (!result) {
    return NextResponse.json({ error: "Ingrediente não encontrado na receita ativa." }, { status: 404 });
  }

  return NextResponse.json(result);
}
