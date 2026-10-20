import { z } from "zod";

export const recipeStepSchema = z.object({
  text: z.string().min(1),
  durationMinutes: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  videoTimestamp: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});

export const recipeIngredientInputSchema = z.object({
  ingredientName: z.string().min(1),
  quantity: z.number().nonnegative().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
  group: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null),
  alternative: z.boolean().optional(),
  inferred: z.boolean().optional(),
});

export const recipeInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable(),
  servings: z.number().int().positive().nullable(),
  prepTime: z.number().int().nonnegative().nullable(),
  cookTime: z.number().int().nonnegative().nullable(),
  steps: z.array(recipeStepSchema),
  ingredients: z.array(recipeIngredientInputSchema),
  categoryIds: z.array(z.string()),
  tags: z.array(z.string().min(1).max(50)),
  sourceUrl: z.string().url().nullable(),
  videoUrl: z.string().url().nullable(),
});

// POST /api/recipes: an imported draft is saved as pending review unless the user marks it
// reviewed on the way in.
export const createRecipeSchema = recipeInputSchema.extend({
  reviewPending: z.boolean().default(false),
});

// PATCH /api/recipes/[id]: `markReviewed` clears the pending-review flag (author only).
export const updateRecipeSchema = recipeInputSchema.extend({
  markReviewed: z.boolean().optional(),
});
