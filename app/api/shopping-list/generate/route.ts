import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { generateShoppingList } from "@/lib/services/shopping-list";

const bodySchema = z.object({ recipeIds: z.array(z.string()).min(1) });

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "recipeIds is required" }, { status: 400 });
  }

  const list = await generateShoppingList(session.user.id, parsed.data.recipeIds);
  return NextResponse.json(list, { status: 201 });
}
