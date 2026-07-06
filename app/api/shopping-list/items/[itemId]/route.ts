import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  removeShoppingListItem,
  setShoppingListItemChecked,
  updateShoppingListItem,
  userOwnsShoppingListItem,
} from "@/lib/services/shopping-list";

const bodySchema = z.object({
  checked: z.boolean().optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { itemId } = await params;
  if (!(await userOwnsShoppingListItem(session.user.id, itemId))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  if (parsed.data.checked !== undefined) {
    await setShoppingListItemChecked(itemId, parsed.data.checked);
  }
  if (parsed.data.quantity !== undefined || parsed.data.unit !== undefined) {
    await updateShoppingListItem(itemId, {
      quantity: parsed.data.quantity ?? null,
      unit: parsed.data.unit ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { itemId } = await params;
  if (!(await userOwnsShoppingListItem(session.user.id, itemId))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  await removeShoppingListItem(itemId);
  return NextResponse.json({ ok: true });
}
