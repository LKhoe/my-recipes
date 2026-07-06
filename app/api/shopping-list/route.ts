import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getLatestShoppingList } from "@/lib/services/shopping-list";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const list = await getLatestShoppingList(session.user.id);
  return NextResponse.json(list);
}
