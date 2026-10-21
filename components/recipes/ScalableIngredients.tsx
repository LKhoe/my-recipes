"use client";

import { useIngredientScaling } from "@/hooks/use-ingredient-scaling";
import { IngredientSections } from "@/components/recipes/IngredientSections";
import { ScaleControls } from "@/components/recipes/ScaleControls";
import type { RecipeIngredientInput } from "@/types";

export function ScalableIngredients({
  originalServings,
  ingredients,
  onServingsChange,
  substituteRecipeId,
}: {
  originalServings: number | null;
  ingredients: RecipeIngredientInput[];
  /** Lets a parent (e.g. "Send to kitchen") know the servings the user is currently viewing. */
  onServingsChange?: (servings: number | null) => void;
  /** Shows "Não tenho" on each ingredient (signed-in members only). */
  substituteRecipeId?: string;
}) {
  const { factor, servings, setFactor, adjustServings } = useIngredientScaling(originalServings, onServingsChange);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-display-sm text-foreground">Ingredientes</h2>
        <ScaleControls servings={servings} factor={factor} onAdjustServings={adjustServings} onSetFactor={setFactor} />
      </div>
      <div className="mt-3">
        <IngredientSections
          ingredients={ingredients}
          factor={factor}
          listClassName="gap-2"
          itemClassName="border-b border-border pb-2 last:border-0"
          substituteRecipeId={substituteRecipeId}
        />
      </div>
    </div>
  );
}
