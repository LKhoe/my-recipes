import { and, desc, eq, exists, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  recipe,
  recipeImage,
  recipeIngredient,
  recipeCategory,
  recipeTag,
  ingredient,
  category,
  tag,
  user,
} from "@/lib/db/schema";
import { findOrCreateIngredient } from "@/lib/services/ingredient";
import { cleanAlternativeFlags } from "@/lib/ingredient-alternatives";
import { normalizeGroupLabel } from "@/lib/ingredient-groups";
import { normalizeUnit } from "@/lib/services/ingredient-parser";
import { findOrCreateTag } from "@/lib/services/tag";
import type { RecipeDetail, RecipeInput, RecipeListItem } from "@/types";

// Accent-insensitive ILIKE (SPEC §4.2's "adequate at this scale" plain-ILIKE search) — plain
// `ilike()` alone would miss e.g. "salmao" typed against a recipe titled "Salmão...", which is
// common in pt-BR (non-Brazilian keyboards, fast typing, autocomplete stripping diacritics).
// unaccent() is a Postgres contrib extension enabled via migration 0002, not a new dependency.
function unaccentIlike(column: AnyPgColumn, pattern: string): SQL {
  return sql`unaccent(${column}) ilike unaccent(${pattern})`;
}

async function replaceRecipeAssociations(
  tx: typeof db,
  recipeId: string,
  input: Pick<RecipeInput, "ingredients" | "categoryIds" | "tags">,
) {
  await tx.delete(recipeIngredient).where(eq(recipeIngredient.recipeId, recipeId));
  await tx.delete(recipeCategory).where(eq(recipeCategory.recipeId, recipeId));
  await tx.delete(recipeTag).where(eq(recipeTag.recipeId, recipeId));

  const ingredients = cleanAlternativeFlags(
    input.ingredients.map((item) => ({ ...item, group: normalizeGroupLabel(item.group) })),
  );
  for (const [index, item] of ingredients.entries()) {
    const canonical = await findOrCreateIngredient(item.ingredientName);
    await tx.insert(recipeIngredient).values({
      recipeId,
      ingredientId: canonical.id,
      quantity: item.quantity !== null ? String(item.quantity) : null,
      // Normalized here (not trusted from the caller) so it holds regardless of which path the
      // data arrives by — manual form free-text, LLM extraction, or JSON-LD import.
      unit: normalizeUnit(item.unit),
      note: item.note,
      group: item.group,
      isAlternative: item.alternative ?? false,
      order: index,
    });
  }

  for (const categoryId of input.categoryIds) {
    await tx.insert(recipeCategory).values({ recipeId, categoryId }).onConflictDoNothing();
  }

  for (const tagName of input.tags) {
    const canonical = await findOrCreateTag(tagName);
    await tx.insert(recipeTag).values({ recipeId, tagId: canonical.id }).onConflictDoNothing();
  }
}

export async function createRecipe(
  authorId: string,
  input: RecipeInput,
  opts: { reviewPending?: boolean } = {},
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(recipe)
      .values({
        authorId,
        title: input.title,
        description: input.description,
        servings: input.servings,
        prepTime: input.prepTime,
        cookTime: input.cookTime,
        steps: input.steps,
        sourceUrl: input.sourceUrl,
        videoUrl: input.videoUrl,
        reviewPending: opts.reviewPending ?? false,
      })
      .returning({ id: recipe.id });

    await replaceRecipeAssociations(tx as unknown as typeof db, created.id, input);

    return created;
  });
}

/** `markReviewed` clears the pending-review flag; callers only pass it for the recipe's author. */
export async function updateRecipe(
  recipeId: string,
  input: RecipeInput,
  opts: { markReviewed?: boolean } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(recipe)
      .set({
        title: input.title,
        description: input.description,
        servings: input.servings,
        prepTime: input.prepTime,
        cookTime: input.cookTime,
        steps: input.steps,
        sourceUrl: input.sourceUrl,
        videoUrl: input.videoUrl,
        ...(opts.markReviewed ? { reviewPending: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(recipe.id, recipeId));

    await replaceRecipeAssociations(tx as unknown as typeof db, recipeId, input);
  });
}

export async function softDeleteRecipe(recipeId: string, userId: string): Promise<boolean> {
  const result = await db
    .update(recipe)
    .set({ deletedAt: new Date() })
    .where(and(eq(recipe.id, recipeId), eq(recipe.authorId, userId), isNull(recipe.deletedAt)))
    .returning({ id: recipe.id });
  return result.length > 0;
}

/** Only the author can sign off on an imported recipe. */
export async function markRecipeReviewed(recipeId: string, userId: string): Promise<boolean> {
  const result = await db
    .update(recipe)
    .set({ reviewPending: false })
    .where(and(eq(recipe.id, recipeId), eq(recipe.authorId, userId), isNull(recipe.deletedAt)))
    .returning({ id: recipe.id });
  return result.length > 0;
}

export async function countPendingReview(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipe)
    .where(and(eq(recipe.authorId, userId), eq(recipe.reviewPending, true), isNull(recipe.deletedAt)));
  return row?.count ?? 0;
}

export type RecipeListFilters = {
  /** Plain-text query, ILIKE'd against title/description/ingredient names (SPEC §4.2). */
  q?: string;
  categoryId?: string;
  tag?: string;
  ingredient?: string;
  /** Only this user's recipes still waiting for review. */
  pendingReviewFor?: string;
};

export async function listRecipes(filters: RecipeListFilters = {}): Promise<RecipeListItem[]> {
  const conditions = [isNull(recipe.deletedAt)];

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(
        unaccentIlike(recipe.title, pattern),
        unaccentIlike(recipe.description, pattern),
        exists(
          db
            .select({ n: sql`1` })
            .from(recipeIngredient)
            .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
            .where(and(eq(recipeIngredient.recipeId, recipe.id), unaccentIlike(ingredient.name, pattern))),
        ),
      )!,
    );
  }

  if (filters.pendingReviewFor) {
    conditions.push(eq(recipe.authorId, filters.pendingReviewFor), eq(recipe.reviewPending, true));
  }

  if (filters.categoryId) {
    conditions.push(
      exists(
        db
          .select({ n: sql`1` })
          .from(recipeCategory)
          .where(and(eq(recipeCategory.recipeId, recipe.id), eq(recipeCategory.categoryId, filters.categoryId))),
      ),
    );
  }

  if (filters.tag) {
    const pattern = `%${filters.tag}%`;
    conditions.push(
      exists(
        db
          .select({ n: sql`1` })
          .from(recipeTag)
          .innerJoin(tag, eq(recipeTag.tagId, tag.id))
          .where(and(eq(recipeTag.recipeId, recipe.id), unaccentIlike(tag.name, pattern))),
      ),
    );
  }

  if (filters.ingredient) {
    const pattern = `%${filters.ingredient}%`;
    conditions.push(
      exists(
        db
          .select({ n: sql`1` })
          .from(recipeIngredient)
          .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
          .where(and(eq(recipeIngredient.recipeId, recipe.id), unaccentIlike(ingredient.name, pattern))),
      ),
    );
  }

  const rows = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      authorName: user.name,
      reviewPending: recipe.reviewPending,
      createdAt: recipe.createdAt,
    })
    .from(recipe)
    .leftJoin(user, eq(recipe.authorId, user.id))
    .where(and(...conditions))
    .orderBy(desc(recipe.createdAt));

  const results: RecipeListItem[] = [];
  for (const row of rows) {
    const [image] = await db
      .select({ path: recipeImage.path })
      .from(recipeImage)
      .where(eq(recipeImage.recipeId, row.id))
      .orderBy(recipeImage.order)
      .limit(1);

    const categoryRows = await db
      .select({ name: category.name })
      .from(recipeCategory)
      .innerJoin(category, eq(recipeCategory.categoryId, category.id))
      .where(eq(recipeCategory.recipeId, row.id));

    results.push({
      id: row.id,
      title: row.title,
      description: row.description,
      authorName: row.authorName,
      imagePath: image?.path ?? null,
      categories: categoryRows.map((c) => c.name),
      reviewPending: row.reviewPending,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return results;
}

export async function getRecipeById(recipeId: string): Promise<RecipeDetail | null> {
  const [row] = await db
    .select({
      id: recipe.id,
      authorId: recipe.authorId,
      authorName: user.name,
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      steps: recipe.steps,
      sourceUrl: recipe.sourceUrl,
      videoUrl: recipe.videoUrl,
      reviewPending: recipe.reviewPending,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    })
    .from(recipe)
    .leftJoin(user, eq(recipe.authorId, user.id))
    .where(and(eq(recipe.id, recipeId), isNull(recipe.deletedAt)))
    .limit(1);

  if (!row) return null;

  const images = await db
    .select({ id: recipeImage.id, path: recipeImage.path, order: recipeImage.order })
    .from(recipeImage)
    .where(eq(recipeImage.recipeId, recipeId))
    .orderBy(recipeImage.order);

  const ingredientRows = await db
    .select({
      ingredientName: ingredient.name,
      quantity: recipeIngredient.quantity,
      unit: recipeIngredient.unit,
      note: recipeIngredient.note,
      group: recipeIngredient.group,
      alternative: recipeIngredient.isAlternative,
    })
    .from(recipeIngredient)
    .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
    .where(eq(recipeIngredient.recipeId, recipeId))
    .orderBy(recipeIngredient.order);

  const categoryRows = await db
    .select({ id: recipeCategory.categoryId })
    .from(recipeCategory)
    .where(eq(recipeCategory.recipeId, recipeId));

  const tagRows = await db
    .select({ name: tag.name })
    .from(recipeTag)
    .innerJoin(tag, eq(recipeTag.tagId, tag.id))
    .where(eq(recipeTag.recipeId, recipeId));

  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.authorName,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepTime: row.prepTime,
    cookTime: row.cookTime,
    steps: row.steps,
    sourceUrl: row.sourceUrl,
    videoUrl: row.videoUrl,
    images,
    ingredients: ingredientRows.map((i) => ({
      ingredientName: i.ingredientName,
      quantity: i.quantity !== null ? Number(i.quantity) : null,
      unit: i.unit,
      note: i.note,
      group: i.group,
      alternative: i.alternative,
    })),
    categoryIds: categoryRows.map((c) => c.id),
    tags: tagRows.map((t) => t.name),
    reviewPending: row.reviewPending,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
