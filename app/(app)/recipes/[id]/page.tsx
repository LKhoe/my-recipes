import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRecipeById } from "@/lib/services/recipe";
import { formatIngredientLine } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DeleteRecipeButton } from "@/components/recipes/DeleteRecipeButton";
import { Pencil, ChefHat, Clock, Users } from "lucide-react";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [recipe, session] = await Promise.all([
    getRecipeById(id),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!recipe) notFound();

  const heroImage = recipe.images[0];
  const isAuthor = session?.user?.id === recipe.authorId;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {heroImage ? (
        <div className="relative mb-6 aspect-16/9 w-full overflow-hidden rounded-2xl bg-muted">
          <Image
            src={`/api/uploads/${heroImage.path}`}
            alt={recipe.title}
            fill
            unoptimized
            className="object-cover"
            priority
          />
        </div>
      ) : (
        <div className="mb-6 flex aspect-16/9 w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <ChefHat className="size-12" />
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-xl text-foreground">{recipe.title}</h1>
          {recipe.authorName && (
            <p className="mt-1 text-sm text-muted-foreground">by {recipe.authorName}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/recipes/${recipe.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </Link>
          </Button>
          {isAuthor && <DeleteRecipeButton recipeId={recipe.id} />}
        </div>
      </div>

      {recipe.description && <p className="mt-4 text-muted-foreground">{recipe.description}</p>}

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        {recipe.servings && (
          <span className="flex items-center gap-1.5">
            <Users className="size-4" /> {recipe.servings} servings
          </span>
        )}
        {recipe.prepTime && (
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" /> {recipe.prepTime} min prep
          </span>
        )}
        {recipe.cookTime && (
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" /> {recipe.cookTime} min cook
          </span>
        )}
      </div>

      {recipe.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recipe.tags.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-[minmax(0,1fr)_2fr]">
        <section>
          <h2 className="font-display text-display-sm text-foreground">Ingredients</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {recipe.ingredients.map((ingredient, i) => (
              <li key={i} className="border-b border-border pb-2 last:border-0">
                {formatIngredientLine(ingredient)}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-display-sm text-foreground">Steps</h2>
          <ol className="mt-3 flex flex-col gap-4">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="text-foreground">{step.text}</p>
                  {step.durationMinutes && (
                    <p className="mt-1 text-xs text-muted-foreground">{step.durationMinutes} min</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {recipe.sourceUrl && (
        <p className="mt-10 text-xs text-muted-foreground">
          Source:{" "}
          <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="underline">
            {recipe.sourceUrl}
          </a>
        </p>
      )}
    </div>
  );
}
