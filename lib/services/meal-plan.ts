import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { mealPlanEntry, mealSlotEnum, recipe } from "@/lib/db/schema";

export type MealSlot = (typeof mealSlotEnum.enumValues)[number];

export type MealPlanEntryView = {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId: string;
  recipeTitle: string;
};

// SPEC §4.4: circle-shared — every member sees and edits the same calendar, no userId scoping.
export async function listMealPlanEntries(startDate: string, endDate: string): Promise<MealPlanEntryView[]> {
  const rows = await db
    .select({
      id: mealPlanEntry.id,
      date: mealPlanEntry.date,
      slot: mealPlanEntry.slot,
      recipeId: mealPlanEntry.recipeId,
      recipeTitle: recipe.title,
    })
    .from(mealPlanEntry)
    .innerJoin(recipe, eq(mealPlanEntry.recipeId, recipe.id))
    .where(and(gte(mealPlanEntry.date, startDate), lte(mealPlanEntry.date, endDate)));

  return rows;
}

export async function addMealPlanEntry(
  date: string,
  slot: MealSlot,
  recipeId: string,
  addedByUserId: string,
): Promise<{ id: string }> {
  const [created] = await db
    .insert(mealPlanEntry)
    .values({ date, slot, recipeId, addedByUserId })
    .returning({ id: mealPlanEntry.id });
  return created;
}

export async function moveMealPlanEntry(id: string, date: string, slot: MealSlot): Promise<void> {
  await db.update(mealPlanEntry).set({ date, slot }).where(eq(mealPlanEntry.id, id));
}

export async function removeMealPlanEntry(id: string): Promise<void> {
  await db.delete(mealPlanEntry).where(eq(mealPlanEntry.id, id));
}
