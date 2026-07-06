import { listCategories } from "@/lib/services/category";
import { NewRecipeClient } from "@/components/recipes/NewRecipeClient";

export default async function NewRecipePage() {
  const categories = await listCategories();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Add a recipe</h1>
      <p className="mt-1 text-muted-foreground">Paste a link, or start from scratch.</p>
      <div className="mt-8">
        <NewRecipeClient categories={categories} />
      </div>
    </div>
  );
}
