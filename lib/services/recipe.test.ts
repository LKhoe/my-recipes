import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  countPendingReview,
  createRecipe,
  findRecipesBySource,
  getRecipeById,
  listRecipes,
  markRecipeReviewed,
  searchRecipesByTitle,
  softDeleteRecipe,
  updateRecipe,
} from "./recipe";
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

describe("ingredient alternatives and review", () => {
  const stamp = Date.now();
  const userIds: string[] = [];

  afterAll(async () => {
    for (const id of userIds) await db.delete(user).where(eq(user.id, id));
  });

  async function makeUser(label: string) {
    const [created] = await db
      .insert(user)
      .values({ email: `${label}-${stamp}@example.com`, name: label })
      .returning({ id: user.id });
    userIds.push(created.id);
    return created.id;
  }

  const baseInput = {
    description: null,
    servings: 4,
    prepTime: null,
    cookTime: null,
    steps: [{ text: "Misture." }],
    categoryIds: [],
    tags: [],
    sourceUrl: "https://example.com/bolo",
    videoUrl: null,
  };

  it("keeps 'or' options after their ingredient, never buys them, and clears a flag with nothing above", async () => {
    const userId = await makeUser("alternatives-test");
    const { id: recipeId } = await createRecipe(userId, {
      ...baseInput,
      title: "Bolo com alternativas",
      ingredients: [
        { ingredientName: "fermento", quantity: 1, unit: "csp", note: null, alternative: true },
        { ingredientName: "manteiga", quantity: 100, unit: "g", note: null },
        { ingredientName: "margarina", quantity: 100, unit: "g", note: null, alternative: true },
        { ingredientName: "ovo", quantity: 2, unit: "unidade", note: null, group: "Cobertura", alternative: true },
      ],
    });

    const recipe = await getRecipeById(recipeId);
    expect(recipe!.ingredients.map((i) => [i.ingredientName, i.alternative])).toEqual([
      ["fermento", false],
      ["manteiga", false],
      ["margarina", true],
      ["ovo", false],
    ]);

    await generateShoppingList(userId, [recipeId]);
    const list = await getLatestShoppingList(userId);
    expect(list!.items.map((i) => i.name).sort()).toEqual(["fermento", "manteiga", "ovo"]);
  });

  it("saves an import as pending review, and only its author can mark it reviewed", async () => {
    const authorId = await makeUser("review-author");
    const otherId = await makeUser("review-other");
    const input = { ...baseInput, title: "Pudim importado", ingredients: [] };
    const { id: recipeId } = await createRecipe(authorId, input, { reviewPending: true });

    expect((await getRecipeById(recipeId))!.reviewPending).toBe(true);
    expect(await countPendingReview(authorId)).toBe(1);
    expect((await listRecipes({ pendingReviewFor: authorId })).map((r) => r.id)).toEqual([recipeId]);
    expect(await listRecipes({ pendingReviewFor: otherId })).toEqual([]);

    expect(await markRecipeReviewed(recipeId, otherId)).toBe(false);
    expect((await getRecipeById(recipeId))!.reviewPending).toBe(true);

    // An edit without the flag leaves it pending; the author's markReviewed clears it.
    await updateRecipe(recipeId, input);
    expect((await getRecipeById(recipeId))!.reviewPending).toBe(true);
    await updateRecipe(recipeId, input, { markReviewed: true });
    expect((await getRecipeById(recipeId))!.reviewPending).toBe(false);
    expect(await countPendingReview(authorId)).toBe(0);

    const { id: second } = await createRecipe(authorId, input, { reviewPending: true });
    expect(await markRecipeReviewed(second, authorId)).toBe(true);
    expect((await getRecipeById(second))!.reviewPending).toBe(false);
  });
});

describe("findRecipesBySource", () => {
  const stamp = Date.now();
  let userId: string;

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("finds a recipe by its page or video however the link is written, and skips deleted ones", async () => {
    const [created] = await db
      .insert(user)
      .values({ email: `by-source-${stamp}@example.com`, name: "Fonte" })
      .returning({ id: user.id });
    userId = created.id;
    const video = `v${String(stamp).slice(-10)}`;
    const base = {
      description: null,
      servings: null,
      prepTime: null,
      cookTime: null,
      steps: [],
      ingredients: [],
      categoryIds: [],
      tags: [],
    };
    const { id: fromVideo } = await createRecipe(userId, {
      ...base,
      title: "Do vídeo",
      sourceUrl: `https://www.youtube.com/watch?v=${video}`,
      videoUrl: `https://www.youtube.com/watch?v=${video}`,
    });
    const { id: fromPage } = await createRecipe(userId, {
      ...base,
      title: "Da página",
      sourceUrl: `https://www.site-${stamp}.com.br/receita/pudim/`,
      videoUrl: null,
    });

    expect(await findRecipesBySource(`https://youtu.be/${video}?t=12`)).toEqual([
      { id: fromVideo, title: "Do vídeo", authorName: "Fonte" },
    ]);
    expect((await findRecipesBySource(`http://site-${stamp}.com.br/receita/pudim?utm_source=x`)).map((r) => r.id)).toEqual([
      fromPage,
    ]);
    expect(await findRecipesBySource(`https://site-${stamp}.com.br/receita/bolo`)).toEqual([]);
    expect(await findRecipesBySource("não é um link")).toEqual([]);

    await softDeleteRecipe(fromPage, userId);
    expect(await findRecipesBySource(`https://site-${stamp}.com.br/receita/pudim`)).toEqual([]);
  });
});

describe("searchRecipesByTitle", () => {
  const stamp = Date.now();
  // A made-up dish word, so the dev database's own recipes never match.
  const dish = `zimbrolete${stamp.toString(36).replace(/\d/g, "")}`;
  let userId: string;

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("ranks recipes with a method, then the exact title, then the rest; skips deleted ones; survives a typo", async () => {
    const [created] = await db
      .insert(user)
      .values({ email: `title-search-${stamp}@example.com`, name: "Busca" })
      .returning({ id: user.id });
    userId = created.id;

    const base = {
      description: null,
      servings: null,
      prepTime: null,
      cookTime: null,
      ingredients: [],
      categoryIds: [],
      tags: [],
      sourceUrl: null,
      videoUrl: null,
    };
    const withSteps = { ...base, steps: [{ text: "Misture." }] };
    const { id: noMethod } = await createRecipe(userId, { ...base, steps: [], title: `Torta ${dish} sem preparo` });
    const { id: lemon } = await createRecipe(userId, { ...withSteps, title: `Torta ${dish} de limão` });
    const { id: exact } = await createRecipe(userId, { ...withSteps, title: `Torta ${dish}` });
    const { id: deleted } = await createRecipe(userId, { ...withSteps, title: `Torta ${dish} antiga` });
    await softDeleteRecipe(deleted, userId);

    const results = await searchRecipesByTitle(`torta ${dish}`);
    expect(results.map((r) => r.id)).toEqual([exact, lemon, noMethod]);
    expect(results[2].hasSteps).toBe(false);

    // One letter misheard, accents aside.
    const typo = await searchRecipesByTitle(`torta ${dish.replace("zimbro", "zinbro")} de limao`);
    expect(typo[0]?.id).toBe(lemon);

    expect(await searchRecipesByTitle("   ")).toEqual([]);
  });
});
