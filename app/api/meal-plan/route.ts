import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addMealPlanEntry, listMealPlanEntries } from "@/lib/services/meal-plan";
import { mealSlotEnum } from "@/lib/db/schema";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const start = dateSchema.safeParse(params.get("start"));
  const end = dateSchema.safeParse(params.get("end"));
  if (!start.success || !end.success) {
    return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const entries = await listMealPlanEntries(start.data, end.data);
  return NextResponse.json(entries);
}

const bodySchema = z.object({
  date: dateSchema,
  slot: z.enum(mealSlotEnum.enumValues),
  recipeId: z.string(),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "date, slot, and recipeId are required" }, { status: 400 });
  }

  const created = await addMealPlanEntry(
    parsed.data.date,
    parsed.data.slot,
    parsed.data.recipeId,
    session.user.id,
  );
  return NextResponse.json(created, { status: 201 });
}
