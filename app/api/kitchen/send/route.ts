import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sendToKitchen } from "@/lib/services/kitchen";

const bodySchema = z.object({
  recipeId: z.string(),
  servingsOverride: z.number().int().positive().nullable(),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "recipeId is required" }, { status: 400 });
  }

  await sendToKitchen(parsed.data.recipeId, parsed.data.servingsOverride);
  return NextResponse.json({ ok: true });
}
