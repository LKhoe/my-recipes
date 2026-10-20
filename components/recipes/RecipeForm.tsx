"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IngredientsEditor } from "@/components/recipes/IngredientsEditor";
import { StepsEditor } from "@/components/recipes/StepsEditor";
import { CategoryPicker } from "@/components/recipes/CategoryPicker";
import { TagsInput } from "@/components/recipes/TagsInput";
import { ImageManager, type UploadedImage } from "@/components/recipes/ImageManager";
import { CheckCircle2 } from "lucide-react";
import { ALLOWED_EXTERNAL_IMAGE_HOSTS } from "@/lib/image-constants";
import type { RecipeIngredientInput, RecipeStep } from "@/types";

export type RecipeFormValues = {
  title: string;
  description: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  steps: RecipeStep[];
  ingredients: RecipeIngredientInput[];
  categoryIds: string[];
  tags: string[];
  sourceUrl: string | null;
  videoUrl: string | null;
};

export const EMPTY_RECIPE_FORM_VALUES: RecipeFormValues = {
  title: "",
  description: "",
  servings: "",
  prepTime: "",
  cookTime: "",
  steps: [],
  ingredients: [],
  categoryIds: [],
  tags: [],
  sourceUrl: null,
  videoUrl: null,
};

function isYouTubeThumbnail(url: string): boolean {
  try {
    return ALLOWED_EXTERNAL_IMAGE_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function uploadPendingFiles(recipeId: string, files: File[]) {
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`/api/recipes/${recipeId}/images`, { method: "POST", body: formData });
  }
}

export function RecipeForm({
  mode,
  recipeId,
  categories,
  initialValues,
  initialImages = [],
  initialRemoteImageUrl,
  imported = false,
  reviewPending = false,
  canReview = false,
}: {
  mode: "create" | "edit";
  recipeId?: string;
  categories: { id: string; name: string }[];
  initialValues?: Partial<RecipeFormValues>;
  initialImages?: UploadedImage[];
  /** SPEC §4.6: the source page/video's photo, fetched server-side right after create. */
  initialRemoteImageUrl?: string | null;
  /** Create mode: the values are an import's draft, saved as pending review unless marked reviewed. */
  imported?: boolean;
  /** Edit mode: the recipe still waits for its author's review. */
  reviewPending?: boolean;
  /** Edit mode: the current user is the author, the only one who can mark it reviewed. */
  canReview?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<RecipeFormValues>({ ...EMPTY_RECIPE_FORM_VALUES, ...initialValues });
  const [images, setImages] = useState<UploadedImage[]>(initialImages);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [remoteImageUrl, setRemoteImageUrl] = useState(initialRemoteImageUrl ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set by the "marcar como revisada" button just before the form submits.
  const markReviewedRef = useRef(false);
  const offersReview = mode === "create" ? imported : reviewPending && canReview;

  function set<K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const markReviewed = offersReview && markReviewedRef.current;
    markReviewedRef.current = false;

    const ingredients = values.ingredients.filter((i) => i.ingredientName.trim().length > 0);
    const steps = values.steps.filter((s) => s.text.trim().length > 0);

    if (!values.title.trim()) {
      setError("O título é obrigatório.");
      return;
    }

    setSubmitting(true);

    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      servings: values.servings ? Number(values.servings) : null,
      prepTime: values.prepTime ? Number(values.prepTime) : null,
      cookTime: values.cookTime ? Number(values.cookTime) : null,
      steps,
      ingredients,
      categoryIds: values.categoryIds,
      tags: values.tags,
      sourceUrl: values.sourceUrl,
      videoUrl: values.videoUrl,
    };

    try {
      if (mode === "create") {
        const res = await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, reviewPending: imported && !markReviewed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Não foi possível salvar a receita.");
        }
        const created = await res.json();
        if (remoteImageUrl) {
          // The import's photo goes first, so it's the cover. A YouTube thumbnail is stored as its
          // own URL rather than downloaded (see DECISIONS.md "Fix: YouTube import uses the video
          // thumbnail URL directly"); a webpage's photo is re-hosted.
          await fetch(`/api/recipes/${created.id}/images`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: remoteImageUrl, external: isYouTubeThumbnail(remoteImageUrl) }),
          }).catch(() => {});
        }
        if (pendingFiles.length > 0) await uploadPendingFiles(created.id, pendingFiles);
        router.push(`/recipes/${created.id}`);
        router.refresh();
      } else if (recipeId) {
        const res = await fetch(`/api/recipes/${recipeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, markReviewed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Não foi possível salvar a receita.");
        }
        router.push(`/recipes/${recipeId}`);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {(values.sourceUrl || values.videoUrl) && (
        <div className="rounded-lg border border-accent bg-accent/40 px-3 py-2 text-sm text-accent-foreground">
          Importado de{" "}
          <a href={values.sourceUrl ?? values.videoUrl ?? "#"} target="_blank" rel="noreferrer" className="underline">
            {values.sourceUrl ?? values.videoUrl}
          </a>
          .{" "}
          {mode === "create"
            ? "Revise o rascunho abaixo antes de salvar."
            : reviewPending
              ? canReview
                ? "Esta receita ainda está pendente de revisão."
                : "Esta receita ainda está pendente de revisão por quem a enviou."
              : null}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Título</Label>
        <Input id="title" required value={values.title} onChange={(e) => set("title", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="servings">Porções</Label>
          <Input
            id="servings"
            type="number"
            min={1}
            value={values.servings}
            onChange={(e) => set("servings", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prepTime">Preparo (min)</Label>
          <Input
            id="prepTime"
            type="number"
            min={0}
            value={values.prepTime}
            onChange={(e) => set("prepTime", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cookTime">Cozimento (min)</Label>
          <Input
            id="cookTime"
            type="number"
            min={0}
            value={values.cookTime}
            onChange={(e) => set("cookTime", e.target.value)}
          />
        </div>
      </div>

      <ImageManager
        recipeId={recipeId}
        images={images}
        onImagesChange={setImages}
        pendingFiles={pendingFiles}
        onPendingFilesChange={setPendingFiles}
        remoteImageUrl={remoteImageUrl}
        onRemoteImageRemove={() => setRemoteImageUrl(null)}
      />

      <IngredientsEditor value={values.ingredients} onChange={(v) => set("ingredients", v)} />
      <StepsEditor value={values.steps} onChange={(v) => set("steps", v)} />
      <CategoryPicker categories={categories} value={values.categoryIds} onChange={(v) => set("categoryIds", v)} />
      <TagsInput value={values.tags} onChange={(v) => set("tags", v)} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {offersReview ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting} onClick={() => (markReviewedRef.current = true)}>
              <CheckCircle2 className="size-4" />
              {submitting ? "Salvando…" : "Salvar e marcar como revisada"}
            </Button>
            <Button type="submit" variant="outline" disabled={submitting}>
              {mode === "create" ? "Salvar para revisar depois" : "Salvar sem marcar como revisada"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Receitas importadas ficam como pendentes de revisão até você confirmar que conferiu o rascunho.
          </p>
        </div>
      ) : (
        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "Salvando…" : mode === "create" ? "Salvar receita" : "Salvar alterações"}
        </Button>
      )}
    </form>
  );
}
