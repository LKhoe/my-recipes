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
