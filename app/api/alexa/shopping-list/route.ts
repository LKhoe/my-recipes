import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedAlexaRequest } from "@/lib/services/alexa-auth";
import {
  addCustomShoppingListItem,
  getMostRecentShoppingListAcrossCircle,
} from "@/lib/services/shopping-list";

const bodySchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  if (!isAuthorizedAlexaRequest(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const list = await getMostRecentShoppingListAcrossCircle();
  if (!list) {
    return NextResponse.json({ error: "Nenhuma lista de compras existe ainda." }, { status: 404 });
  }

  const created = await addCustomShoppingListItem(
    list.id,
    parsed.data.name,
    parsed.data.quantity ?? null,
    parsed.data.unit ?? null,
  );
  return NextResponse.json(created, { status: 201 });
}
