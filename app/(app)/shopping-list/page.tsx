import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getLatestShoppingList } from "@/lib/services/shopping-list";
import { listRecipes } from "@/lib/services/recipe";
import { ShoppingListClient } from "@/components/shopping-list/ShoppingListClient";
import { GenerateFromRecipes } from "@/components/shopping-list/GenerateFromRecipes";
import { ShoppingCart } from "lucide-react";

export default async function ShoppingListPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const [list, recipes] = await Promise.all([
    session?.user ? getLatestShoppingList(session.user.id) : Promise.resolve(null),
    listRecipes(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Shopping List</h1>

      <div className="mt-8">
        <GenerateFromRecipes recipes={recipes.map((r) => ({ id: r.id, title: r.title }))} />
      </div>

      <div className="mt-8">
        {list ? (
          <ShoppingListClient items={list.items} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
            <ShoppingCart className="size-10 text-muted-foreground" />
            <p className="font-display text-display-sm text-foreground">No shopping list yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generate one from the meal plan, or pick recipes above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
