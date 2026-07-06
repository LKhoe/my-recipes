import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { kitchenState, recipe, SINGLETON_KITCHEN_STATE_ID } from "@/lib/db/schema";

export type KitchenStateView = {
  activeRecipeId: string | null;
  activeRecipeTitle: string | null;
  servingsOverride: number | null;
  currentStepIndex: number;
};

// SPEC §9.1: a single circle-wide row. There is intentionally no per-user scoping here.
export async function getKitchenState(): Promise<KitchenStateView | null> {
  const [row] = await db
    .select({
      activeRecipeId: kitchenState.activeRecipeId,
      servingsOverride: kitchenState.servingsOverride,
      currentStepIndex: kitchenState.currentStepIndex,
      activeRecipeTitle: recipe.title,
    })
    .from(kitchenState)
    .leftJoin(recipe, eq(kitchenState.activeRecipeId, recipe.id))
    .where(eq(kitchenState.id, SINGLETON_KITCHEN_STATE_ID))
    .limit(1);

  return row ?? null;
}

/** SPEC §4.1 "Send to kitchen" — makes this recipe (at this scaling) the circle's active one. */
export async function sendToKitchen(recipeId: string, servingsOverride: number | null): Promise<void> {
  await db
    .insert(kitchenState)
    .values({
      id: SINGLETON_KITCHEN_STATE_ID,
      activeRecipeId: recipeId,
      servingsOverride,
      currentStepIndex: 0,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: kitchenState.id,
      set: { activeRecipeId: recipeId, servingsOverride, currentStepIndex: 0, updatedAt: new Date() },
    });
}

/**
 * SPEC §4.1a: Cook Mode syncs its step position here — but only while the recipe being
 * cooked is still the active kitchen recipe, so a stale tab left open on an old recipe can't
 * clobber whatever the circle is actually cooking now.
 */
export async function updateKitchenStep(recipeId: string, currentStepIndex: number): Promise<boolean> {
  const result = await db
    .update(kitchenState)
    .set({ currentStepIndex, updatedAt: new Date() })
    .where(and(eq(kitchenState.id, SINGLETON_KITCHEN_STATE_ID), eq(kitchenState.activeRecipeId, recipeId)))
    .returning({ activeRecipeId: kitchenState.activeRecipeId });

  return result.length > 0;
}
