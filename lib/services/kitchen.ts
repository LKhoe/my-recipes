import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { kitchenState, recipe, SINGLETON_KITCHEN_STATE_ID } from "@/lib/db/schema";
import { groupAlternatives } from "@/lib/ingredient-alternatives";
import { getRecipeById } from "@/lib/services/recipe";
import { formatScaledQuantity, scaleQuantity } from "@/lib/scale";
import type { RecipeDetail } from "@/types";

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

export type KitchenStepAction = "next" | "previous" | "jump";

/**
 * SPEC §9.1 `POST /api/alexa/step` — "advance/rewind/jump currentStepIndex". Unlike
 * updateKitchenStep (used by web Cook Mode, which always knows its own recipeId), the Alexa
 * skill has no notion of which recipe it's stepping through beyond "whatever's active" — so
 * this operates on the active recipe directly and clamps to its actual step count instead of
 * requiring the caller to pass one in.
 */
export async function advanceKitchenStep(
  action: KitchenStepAction,
  jumpToIndex?: number,
): Promise<{ currentStepIndex: number; totalSteps: number; currentStepText: string } | null> {
  const [row] = await db
    .select({ currentStepIndex: kitchenState.currentStepIndex, steps: recipe.steps })
    .from(kitchenState)
    .innerJoin(recipe, eq(kitchenState.activeRecipeId, recipe.id))
    .where(eq(kitchenState.id, SINGLETON_KITCHEN_STATE_ID))
    .limit(1);

  if (!row) return null;

  const totalSteps = row.steps.length;
  const lastIndex = Math.max(totalSteps - 1, 0);

  let nextIndex = row.currentStepIndex;
  if (action === "next") nextIndex = Math.min(row.currentStepIndex + 1, lastIndex);
  else if (action === "previous") nextIndex = Math.max(row.currentStepIndex - 1, 0);
  else if (action === "jump") nextIndex = Math.min(Math.max(jumpToIndex ?? 0, 0), lastIndex);

  await db
    .update(kitchenState)
    .set({ currentStepIndex: nextIndex, updatedAt: new Date() })
    .where(eq(kitchenState.id, SINGLETON_KITCHEN_STATE_ID));

  return { currentStepIndex: nextIndex, totalSteps, currentStepText: row.steps[nextIndex]?.text ?? "" };
}

export type ActiveKitchenRecipe = {
  recipe: RecipeDetail;
  /** Servings being cooked: the kitchen's override, else the recipe's own. */
  servings: number | null;
  /** Multiplier for the stored quantities (formatIngredientLine's `factor`). */
  factor: number;
  currentStepIndex: number;
};

/** The Alexa skill's view of the kitchen: the full active recipe, its scaling and current step. */
export async function getActiveKitchenRecipe(): Promise<ActiveKitchenRecipe | null> {
  const state = await getKitchenState();
  if (!state?.activeRecipeId) return null;

  const recipeDetail = await getRecipeById(state.activeRecipeId);
  if (!recipeDetail) return null;

  const servings = state.servingsOverride ?? recipeDetail.servings;
  const factor = state.servingsOverride && recipeDetail.servings ? state.servingsOverride / recipeDetail.servings : 1;
  const lastIndex = Math.max(recipeDetail.steps.length - 1, 0);
  return {
    recipe: recipeDetail,
    servings,
    factor,
    currentStepIndex: Math.min(state.currentStepIndex, lastIndex),
  };
}

export type AlexaScaledIngredient = { ingredientName: string; quantity: string; unit: string | null };

export type AlexaActiveRecipe = {
  recipeId: string;
  title: string;
  servings: number | null;
  currentStepIndex: number;
  totalSteps: number;
  currentStepText: string;
  ingredients: AlexaScaledIngredient[];
};

/** SPEC §9.1 `GET /api/alexa/active-recipe` — "active recipe, scaled ingredients, current step". */
export async function getActiveRecipeForAlexa(): Promise<AlexaActiveRecipe | null> {
  const state = await getKitchenState();
  if (!state?.activeRecipeId) return null;

  const recipeDetail = await getRecipeById(state.activeRecipeId);
  if (!recipeDetail) return null;

  const effectiveServings = state.servingsOverride ?? recipeDetail.servings;

  return {
    recipeId: recipeDetail.id,
    title: recipeDetail.title,
    servings: effectiveServings,
    currentStepIndex: state.currentStepIndex,
    totalSteps: recipeDetail.steps.length,
    currentStepText: recipeDetail.steps[state.currentStepIndex]?.text ?? "",
    // An "or" option is read out with the ingredient it replaces ("manteiga ou margarina").
    ingredients: groupAlternatives(recipeDetail.ingredients.map((item, index) => ({ item, index }))).map(
      ({ primary: { item: i }, alternatives }) => ({
        ingredientName: [i.ingredientName, ...alternatives.map((a) => a.item.ingredientName)].join(" ou "),
        quantity: formatScaledQuantity(
          i.quantity !== null && recipeDetail.servings && effectiveServings
            ? scaleQuantity(i.quantity, recipeDetail.servings, effectiveServings)
            : i.quantity,
          i.unit,
        ),
        unit: i.unit,
      }),
    ),
  };
}

/**
 * SPEC §9.1 `GET /api/alexa/quantity?ingredient=...` — "scaled quantity lookup for one
 * ingredient". Matches case-insensitively against a substring of the active recipe's ingredient
 * names, since voice input ("how much flour") won't exactly match a canonical name like
 * "farinha de trigo".
 */
export async function getActiveRecipeIngredientQuantity(query: string): Promise<AlexaScaledIngredient | null> {
  const active = await getActiveRecipeForAlexa();
  if (!active) return null;

  const normalizedQuery = query.trim().toLowerCase();
  return active.ingredients.find((i) => i.ingredientName.toLowerCase().includes(normalizedQuery)) ?? null;
}
