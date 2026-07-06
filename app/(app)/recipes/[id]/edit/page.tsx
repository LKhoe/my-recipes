import { notFound } from "next/navigation";
import { getRecipeById } from "@/lib/services/recipe";
import { listCategories } from "@/lib/services/category";
import { RecipeForm, type RecipeFormValues } from "@/components/recipes/RecipeForm";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [recipe, categories] = await Promise.all([getRecipeById(id), listCategories()]);

  if (!recipe) notFound();

  const initialValues: Partial<RecipeFormValues> = {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: recipe.servings != null ? String(recipe.servings) : "",
    prepTime: recipe.prepTime != null ? String(recipe.prepTime) : "",
    cookTime: recipe.cookTime != null ? String(recipe.cookTime) : "",
    steps: recipe.steps,
    ingredients: recipe.ingredients,
    categoryIds: recipe.categoryIds,
    tags: recipe.tags,
    sourceUrl: recipe.sourceUrl,
    videoUrl: recipe.videoUrl,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Edit recipe</h1>
      <div className="mt-8">
        <RecipeForm
          mode="edit"
          recipeId={recipe.id}
          categories={categories}
          initialValues={initialValues}
          initialImages={recipe.images}
        />
      </div>
    </div>
  );
}
