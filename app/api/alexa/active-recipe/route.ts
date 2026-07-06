import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAlexaRequest } from "@/lib/services/alexa-auth";
import { getActiveRecipeForAlexa } from "@/lib/services/kitchen";

export async function GET(request: NextRequest) {
  if (!isAuthorizedAlexaRequest(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const active = await getActiveRecipeForAlexa();
  if (!active) {
    return NextResponse.json({ error: "Nenhuma receita ativa na cozinha." }, { status: 404 });
  }

  return NextResponse.json(active);
}
