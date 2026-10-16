import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createRecipe, getRecipeById, listRecipes } from "./recipe";
import { generateShoppingList, getLatestShoppingList } from "./shopping-list";

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

describe("listRecipes accent-insensitive search", () => {
  const testEmail = `accent-search-test-${Date.now()}@example.com`;
  let userId: string;

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("finds a recipe by title even when the query drops diacritics (bug: plain ILIKE missed 'salmao' vs 'Salmão')", async () => {
    const [created] = await db
      .insert(user)
      .values({ email: testEmail, name: "Accent Search Test" })
      .returning({ id: user.id });
    userId = created.id;

    const uniqueTitle = `Salmão de teste ${Date.now()}`;
    await createRecipe(userId, {
      title: uniqueTitle,
      description: null,
      servings: 2,
      prepTime: null,
      cookTime: null,
      steps: [{ text: "Asse." }],
      ingredients: [],
      categoryIds: [],
      tags: [],
      sourceUrl: null,
      videoUrl: null,
    });

    const withoutAccent = uniqueTitle.replace("ã", "a");
    const results = await listRecipes({ q: withoutAccent });

    expect(results.some((r) => r.title === uniqueTitle)).toBe(true);
  });
});

describe("ingredient sections", () => {
  const testEmail = `ingredient-sections-test-${Date.now()}@example.com`;
  let userId: string;

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("round-trips each ingredient's section, and the shopping list still merges across sections", async () => {
    const [created] = await db
      .insert(user)
      .values({ email: testEmail, name: "Ingredient Sections Test" })
      .returning({ id: user.id });
    userId = created.id;

    const { id: recipeId } = await createRecipe(userId, {
      title: "Risoto com caldo caseiro",
      description: null,
      servings: 4,
      prepTime: null,
      cookTime: null,
      steps: [{ text: "Faça o caldo." }, { text: "Faça o risoto." }],
      ingredients: [
        { ingredientName: "cebola", quantity: 1, unit: "unidade", note: null, group: "CALDO:" },
        { ingredientName: "cenoura", quantity: 1, unit: "unidade", note: null, group: "Caldo" },
        { ingredientName: "cebola", quantity: 0.5, unit: "unidade", note: "picada", group: "Risoto" },
        { ingredientName: "sal", quantity: null, unit: null, note: "a gosto", group: "  " },
      ],
      categoryIds: [],
      tags: [],
      sourceUrl: null,
      videoUrl: null,
    });

    const recipe = await getRecipeById(recipeId);
    expect(recipe!.ingredients.map((i) => [i.group, i.ingredientName, i.quantity])).toEqual([
      ["Caldo", "cebola", 1],
      ["Caldo", "cenoura", 1],
      ["Risoto", "cebola", 0.5],
      [null, "sal", null],
    ]);

    const { id: listId } = await generateShoppingList(userId, [recipeId]);
    const list = await getLatestShoppingList(userId);
    expect(list!.id).toBe(listId);
    const cebola = list!.items.filter((i) => i.name === "cebola");
    expect(cebola).toHaveLength(1);
    expect(cebola[0].quantity).toBe(1.5);
  });
});
