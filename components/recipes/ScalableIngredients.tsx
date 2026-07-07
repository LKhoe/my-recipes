"use client";

import { formatIngredientLine } from "@/lib/format";
import { useIngredientScaling } from "@/hooks/use-ingredient-scaling";
import { ScaleControls } from "@/components/recipes/ScaleControls";
import type { RecipeIngredientInput } from "@/types";

export function ScalableIngredients({
  originalServings,
  ingredients,
  onServingsChange,
}: {
  originalServings: number | null;
  ingredients: RecipeIngredientInput[];
  /** Lets a parent (e.g. "Send to kitchen") know the servings the user is currently viewing. */
  onServingsChange?: (servings: number | null) => void;
}) {
  const { factor, servings, setFactor, adjustServings } = useIngredientScaling(originalServings, onServingsChange);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-display-sm text-foreground">Ingredientes</h2>
        <ScaleControls servings={servings} factor={factor} onAdjustServings={adjustServings} onSetFactor={setFactor} />
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {ingredients.map((ingredientItem, i) => (
          <li key={i} className="border-b border-border pb-2 last:border-0">
            {formatIngredientLine(ingredientItem, factor)}
          </li>
        ))}
      </ul>
    </div>
  );
}
