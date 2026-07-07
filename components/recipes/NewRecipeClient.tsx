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
  } | null>(null);

  if (draft?.recipeFound) {
    return (
      <RecipeForm
        mode="create"
        categories={categories}
        initialValues={draftToFormValues(draft)}
        initialRemoteImageUrl={draft.imageUrl}
      />
    );
  }

  if (manualPrefill) {
    return (
      <RecipeForm
        mode="create"
        categories={categories}
        initialValues={manualPrefill.values}
        initialRemoteImageUrl={manualPrefill.imageUrl}
      />
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
              // title/videoUrl/thumbnail prefilled from the video's own metadata.
              setManualPrefill({
                values: {
                  title: result.title,
                  sourceUrl: result.sourceUrl,
                  videoUrl: result.videoUrl,
                },
                imageUrl: result.imageUrl,
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
