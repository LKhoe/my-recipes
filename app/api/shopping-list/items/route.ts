import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addCustomShoppingListItem, getLatestShoppingList } from "@/lib/services/shopping-list";

const bodySchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nonnegative().nullable(),
  unit: z.string().nullable(),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const list = await getLatestShoppingList(session.user.id);
  if (!list) {
    return NextResponse.json({ error: "Gere uma lista de compras primeiro." }, { status: 404 });
  }

  const created = await addCustomShoppingListItem(
    list.id,
    parsed.data.name,
    parsed.data.quantity,
    parsed.data.unit,
  );
  return NextResponse.json(created, { status: 201 });
}
