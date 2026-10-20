"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportBox } from "@/components/recipes/ImportBox";
import { RecipeForm, type RecipeFormValues } from "@/components/recipes/RecipeForm";
import type { RecipeDraft } from "@/types";

function draftToFormValues(draft: RecipeDraft): Partial<RecipeFormValues> {
  return {
    title: draft.title,
    description: draft.description ?? "",
    servings: draft.servings != null ? String(draft.servings) : "",
    prepTime: draft.prepTime != null ? String(draft.prepTime) : "",
    cookTime: draft.cookTime != null ? String(draft.cookTime) : "",
    steps: draft.steps,
    ingredients: draft.ingredients,
    categoryIds: [],
    tags: [],
    sourceUrl: draft.sourceUrl,
    videoUrl: draft.videoUrl,
  };
}

export function NewRecipeClient({ categories }: { categories: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [manualPrefill, setManualPrefill] = useState<{
    values: Partial<RecipeFormValues>;
    imageUrl: string | null;
    notice: string;
  } | null>(null);

  if (draft?.recipeFound) {
    return (
      <div className="flex flex-col gap-4">
        {draft.warning && (
          <p role="status" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {draft.warning}
          </p>
        )}
        <RecipeForm
          mode="create"
          categories={categories}
          initialValues={draftToFormValues(draft)}
          initialRemoteImageUrl={draft.imageUrl}
          imported
        />
      </div>
    );
  }

  if (manualPrefill) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-lg border border-accent bg-accent/30 p-3 text-sm">
          {manualPrefill.notice}
        </p>
        <RecipeForm
          mode="create"
          categories={categories}
          initialValues={manualPrefill.values}
          initialRemoteImageUrl={manualPrefill.imageUrl}
        />
      </div>
    );
  }

  return (
    <Tabs defaultValue="import">
      <TabsList>
        <TabsTrigger value="import">Importar de um link</TabsTrigger>
        <TabsTrigger value="manual">Entrada manual</TabsTrigger>
      </TabsList>

      <TabsContent value="import" className="pt-4">
        <ImportBox
          onImported={(result) => {
            if (result.recipeFound) {
              setDraft(result);
            } else {
              // SPEC §4.6b step 3: no recipe found in the video — open manual entry with
              // title/videoUrl/thumbnail prefilled from the video's own metadata, and say why.
              setManualPrefill({
                values: {
                  title: result.title,
                  sourceUrl: result.sourceUrl,
                  videoUrl: result.videoUrl,
                },
                imageUrl: result.imageUrl,
                notice: [
                  result.videoUrl
                    ? "Não encontramos uma receita neste vídeo, então abrimos a entrada manual com o título e o link do vídeo já preenchidos."
                    : "Não encontramos uma receita nesta página, então abrimos a entrada manual com o link já preenchido.",
                  result.warning,
                ]
                  .filter(Boolean)
                  .join(" "),
              });
            }
          }}
        />
      </TabsContent>

      <TabsContent value="manual" className="pt-4">
        <RecipeForm mode="create" categories={categories} />
      </TabsContent>
    </Tabs>
  );
}
