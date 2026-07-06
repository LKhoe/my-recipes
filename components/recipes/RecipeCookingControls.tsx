"use client";

import { useState } from "react";
import Link from "next/link";
import { ScalableIngredients } from "@/components/recipes/ScalableIngredients";
import { SendToKitchenButton } from "@/components/recipes/SendToKitchenButton";
import { Button } from "@/components/ui/button";
import { ChefHat } from "lucide-react";
import type { RecipeIngredientInput } from "@/types";

export function RecipeCookingControls({
  recipeId,
  originalServings,
  ingredients,
  isActiveInKitchen,
}: {
  recipeId: string;
  originalServings: number | null;
  ingredients: RecipeIngredientInput[];
  isActiveInKitchen: boolean;
}) {
  const [servings, setServings] = useState(originalServings);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href={`/recipes/${recipeId}/cook`}>
            <ChefHat className="size-4" /> Começar a cozinhar
          </Link>
        </Button>
        <SendToKitchenButton recipeId={recipeId} servings={servings} isActive={isActiveInKitchen} />
      </div>
      <ScalableIngredients
        originalServings={originalServings}
        ingredients={ingredients}
        onServingsChange={setServings}
      />
    </div>
  );
}
