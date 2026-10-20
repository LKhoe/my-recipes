import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listRecipes } from "@/lib/services/recipe";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import { RefillStepsControl } from "@/components/recipes/RefillStepsControl";
import { filterVideoRecipeIds } from "@/lib/services/recipe";

// The signed-in user's imported recipes still waiting for review. Only the author can mark a
// recipe reviewed, so other members' pending recipes aren't listed here.
export default async function ReviewPage() {
  const session = await requireSession("/review");
  const recipes = await listRecipes({ pendingReviewFor: session.user.id });
  // Videos imported while YouTube blocked their captions came out without a method.
  const withoutSteps = recipes.filter((r) => !r.hasSteps);
  const fromVideos = await filterVideoRecipeIds(withoutSteps.map((r) => r.id));
  const refillable = withoutSteps.filter((r) => fromVideos.has(r.id)).map((r) => r.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Para revisar</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Receitas que você importou de um site ou do YouTube e ainda não conferiu. Abra cada uma, corrija o que
        for preciso e marque-a como revisada.
      </p>

      {recipes.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
          <ClipboardCheck className="size-10 text-muted-foreground" />
          <p className="font-display text-display-sm text-foreground">Nada para revisar</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Todas as receitas que você importou já foram revisadas.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/recipes/new">Importar uma receita</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {recipes.length === 1 ? "1 receita pendente" : `${recipes.length} receitas pendentes`}
            {withoutSteps.length > 0 && ` · ${withoutSteps.length} sem modo de preparo`}
          </p>
          {refillable.length > 0 && (
            <section className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">
                {refillable.length === 1
                  ? "1 receita de vídeo foi importada sem modo de preparo"
                  : `${refillable.length} receitas de vídeo foram importadas sem modo de preparo`}
                , provavelmente porque o YouTube bloqueou as legendas na hora. Dá para ler os vídeos de novo e
                preencher só o modo de preparo, sem mexer no resto. Cada vídeo é uma chamada à IA.
              </p>
              <RefillStepsControl
                recipeIds={refillable}
                label={refillable.length === 1 ? "Buscar modo de preparo" : `Buscar modo de preparo das ${refillable.length}`}
              />
            </section>
          )}
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe, index) => (
              <RecipeCard key={recipe.id} recipe={recipe} index={index} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
