"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatIngredientLine } from "@/lib/format";
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
  const [servings, setServings] = useState(originalServings);

  function update(next: number) {
    if (next < 1) return;
    setServings(next);
    onServingsChange?.(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-sm text-foreground">Ingredientes</h2>
        {originalServings && servings && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => update(servings - 1)}
              className="flex size-7 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
              aria-label="Menos porções"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-16 text-center text-sm text-muted-foreground">{servings} porções</span>
            <button
              type="button"
              onClick={() => update(servings + 1)}
              className="flex size-7 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
              aria-label="Mais porções"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {ingredients.map((ingredientItem, i) => (
          <li key={i} className="border-b border-border pb-2 last:border-0">
            {formatIngredientLine(
              ingredientItem,
              originalServings && servings ? { originalServings, targetServings: servings } : null,
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
