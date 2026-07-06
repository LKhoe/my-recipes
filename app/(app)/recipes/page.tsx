import Link from "next/link";
import { listRecipes } from "@/lib/services/recipe";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { Button } from "@/components/ui/button";
import { Plus, ChefHat } from "lucide-react";

export default async function RecipesPage() {
  const recipes = await listRecipes();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-display-lg text-foreground">Recipes</h1>
        <Button asChild>
          <Link href="/recipes/new">
            <Plus className="size-4" /> Add recipe
          </Link>
        </Button>
      </div>

      {recipes.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
          <ChefHat className="size-10 text-muted-foreground" />
          <p className="font-display text-display-sm text-foreground">The recipe box is empty</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Import one from a URL or YouTube video, or add your own by hand.
          </p>
          <Button asChild className="mt-2">
            <Link href="/recipes/new">Add your first recipe</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
