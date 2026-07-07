import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createRecipe, getRecipeById } from "./recipe";

// Integration test — hits the real dev database (per this project's convention: verify against
// real data, not just mocks). Requires `docker compose up -d postgres` and a migrated DATABASE_URL,
// same as running the app itself. The recipe.authorId -> user.id FK cascades onDelete, so
// deleting the throwaway user in afterAll cleans up its recipe/recipeIngredient rows too.
describe("createRecipe unit normalization", () => {
  const testEmail = `unit-normalization-test-${Date.now()}@example.com`;
  let userId: string;

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("normalizes raw unit variants through the alias table on save (SPEC bug: recipe.ts previously stored units as-typed)", async () => {
    const [created] = await db
      .insert(user)
      .values({ email: testEmail, name: "Unit Normalization Test" })
      .returning({ id: user.id });
    userId = created.id;

    const { id: recipeId } = await createRecipe(userId, {
      title: "Teste de normalização de unidade",
      description: null,
      servings: 4,
      prepTime: null,
      cookTime: null,
      steps: [{ text: "Misture tudo." }],
      ingredients: [
        { ingredientName: "açúcar", quantity: 2, unit: "colher de sopa", note: null },
        { ingredientName: "queijo", quantity: 3, unit: "fatias", note: null },
        { ingredientName: "sal", quantity: null, unit: null, note: "a gosto" },
      ],
      categoryIds: [],
      tags: [],
      sourceUrl: null,
      videoUrl: null,
    });

    const recipe = await getRecipeById(recipeId);
    expect(recipe).not.toBeNull();

    const acucar = recipe!.ingredients.find((i) => i.ingredientName === "açúcar");
    const queijo = recipe!.ingredients.find((i) => i.ingredientName === "queijo");
    const sal = recipe!.ingredients.find((i) => i.ingredientName === "sal");

    expect(acucar?.unit).toBe("csp");
    expect(queijo?.unit).toBe("fatia");
    expect(sal?.unit).toBeNull();
  });
});
