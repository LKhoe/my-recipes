import Image from "next/image";
import Link from "next/link";
import { ChefHat } from "lucide-react";
import type { RecipeListItem } from "@/types";

export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-soft-lg"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
        {recipe.imagePath ? (
          <Image
            src={`/api/uploads/${recipe.imagePath}`}
            alt={recipe.title}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ChefHat className="size-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-display text-display-sm leading-snug text-foreground">{recipe.title}</h3>
        {recipe.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{recipe.description}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          {recipe.categories.slice(0, 3).map((c) => (
            <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {c}
            </span>
          ))}
          {recipe.authorName && (
            <span className="ml-auto text-xs text-muted-foreground">by {recipe.authorName}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
