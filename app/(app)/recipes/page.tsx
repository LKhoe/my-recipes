import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listRecipes } from "@/lib/services/recipe";
import { listCategories } from "@/lib/services/category";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChefHat, Search } from "lucide-react";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSession("/recipes");
  const params = await searchParams;
  const [recipes, categories] = await Promise.all([
    listRecipes({
      q: params.q,
      categoryId: params.categoryId,
      tag: params.tag,
      ingredient: params.ingredient,
    }),
    listCategories(),
  ]);

  const hasFilters = Boolean(params.q || params.categoryId || params.tag || params.ingredient);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-display-lg text-foreground">Receitas</h1>
        <Button asChild>
          <Link href="/recipes/new">
            <Plus className="size-4" /> Adicionar receita
          </Link>
        </Button>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={params.q ?? ""} placeholder="Buscar título, descrição, ingrediente…" className="pl-8" />
        </div>
        <select
          name="categoryId"
          defaultValue={params.categoryId ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input name="tag" defaultValue={params.tag ?? ""} placeholder="Etiqueta" className="w-28" />
        <Input name="ingredient" defaultValue={params.ingredient ?? ""} placeholder="Ingrediente" className="w-32" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        {hasFilters && (
          <Button asChild variant="ghost">
            <Link href="/recipes">Limpar</Link>
          </Button>
        )}
      </form>

      {recipes.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
          <ChefHat className="size-10 animate-gentle-bob text-muted-foreground" />
          <p className="font-display text-display-sm text-foreground">
            {hasFilters ? "Nenhuma receita corresponde aos filtros" : "A caixa de receitas está vazia"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {hasFilters
              ? "Tente uma busca mais ampla, ou limpe os filtros."
              : "Importe uma de um link ou vídeo do YouTube, ou adicione a sua manualmente."}
          </p>
          {!hasFilters && (
            <Button asChild className="mt-2">
              <Link href="/recipes/new">Adicionar sua primeira receita</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe, index) => (
            <RecipeCard key={recipe.id} recipe={recipe} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
