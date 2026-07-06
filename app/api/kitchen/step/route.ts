import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { updateKitchenStep } from "@/lib/services/kitchen";

const bodySchema = z.object({
  recipeId: z.string(),
  currentStepIndex: z.number().int().nonnegative(),
});

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "recipeId e currentStepIndex são obrigatórios" }, { status: 400 });
  }

  const applied = await updateKitchenStep(parsed.data.recipeId, parsed.data.currentStepIndex);
  return NextResponse.json({ applied });
}
