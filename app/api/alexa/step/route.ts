import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedAlexaRequest } from "@/lib/services/alexa-auth";
import { advanceKitchenStep } from "@/lib/services/kitchen";

const bodySchema = z.object({
  action: z.enum(["next", "previous", "jump"]),
  index: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  if (!isAuthorizedAlexaRequest(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'action deve ser "next", "previous" ou "jump"' }, { status: 400 });
  }
  if (parsed.data.action === "jump" && parsed.data.index === undefined) {
    return NextResponse.json({ error: 'index é obrigatório quando action é "jump"' }, { status: 400 });
  }

  const result = await advanceKitchenStep(parsed.data.action, parsed.data.index);
  if (!result) {
    return NextResponse.json({ error: "Nenhuma receita ativa na cozinha." }, { status: 404 });
  }

  return NextResponse.json(result);
}
