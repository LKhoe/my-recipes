import { listCategories } from "@/lib/services/category";
import { NewRecipeClient } from "@/components/recipes/NewRecipeClient";

export default async function NewRecipePage() {
  const categories = await listCategories();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Adicionar receita</h1>
      <p className="mt-1 text-muted-foreground">Cole um link, ou comece do zero.</p>
      <div className="mt-8">
        <NewRecipeClient categories={categories} />
      </div>
    </div>
  );
}
