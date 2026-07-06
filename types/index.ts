import type { RecipeStep } from "@/lib/db/schema";

export type { RecipeStep };

export type RecipeIngredientInput = {
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  /** Draft-only (SPEC §4.6/4.6b): true when a quantity was estimated rather than read verbatim. */
  inferred?: boolean;
};

export type RecipeInput = {
  title: string;
  description: string | null;
  servings: number | null;
  prepTime: number | null;
  cookTime: number | null;
  steps: RecipeStep[];
  ingredients: RecipeIngredientInput[];
  categoryIds: string[];
  tags: string[];
  sourceUrl: string | null;
  videoUrl: string | null;
};

/** Result of the import pipeline (SPEC §4.6/§4.6b) — an editable draft, not yet persisted. */
export type RecipeDraft = {
  recipeFound: boolean;
  title: string;
  description: string | null;
  servings: number | null;
  prepTime: number | null;
  cookTime: number | null;
  steps: RecipeStep[];
  ingredients: RecipeIngredientInput[];
  sourceUrl: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
};

export type RecipeListItem = {
  id: string;
  title: string;
  description: string | null;
  authorName: string | null;
  imagePath: string | null;
  categories: string[];
  createdAt: string;
};

export type RecipeDetail = RecipeInput & {
  id: string;
  authorId: string;
  authorName: string | null;
  images: { id: string; path: string; order: number }[];
  createdAt: string;
  updatedAt: string;
};
