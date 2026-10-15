import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getRecipeById } from "@/lib/services/recipe";
import { getKitchenState } from "@/lib/services/kitchen";
import { CookModeClient } from "@/components/recipes/CookModeClient";

export default async function CookModePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession(`/recipes/${id}/cook`);
  const [recipe, kitchenState] = await Promise.all([getRecipeById(id), getKitchenState()]);

  if (!recipe) notFound();

  const isActiveInKitchen = kitchenState?.activeRecipeId === recipe.id;

  return (
    <CookModeClient
      recipeId={recipe.id}
      title={recipe.title}
      originalServings={recipe.servings}
      ingredients={recipe.ingredients}
      steps={recipe.steps}
      isActiveInKitchen={isActiveInKitchen}
      initialStepIndex={isActiveInKitchen ? kitchenState!.currentStepIndex : 0}
    />
  );
}
