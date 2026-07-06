import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { extractRecipeFromJsonLd } from "./jsonld";

function loadFixture(name: string): string {
  return readFileSync(path.join(process.cwd(), "fixtures", "import", name), "utf-8");
}

describe("extractRecipeFromJsonLd", () => {
  it("parses a plain Recipe node with servings, durations, and a 'to taste' ingredient", () => {
    const html = loadFixture("jsonld-basic.html");
    const draft = extractRecipeFromJsonLd(html, "https://example.com/roast-chicken");

    expect(draft).not.toBeNull();
    expect(draft!.recipeFound).toBe(true);
    expect(draft!.title).toBe("Simple Roast Chicken");
    expect(draft!.servings).toBe(4);
    expect(draft!.prepTime).toBe(15);
    expect(draft!.cookTime).toBe(90);
    expect(draft!.steps).toHaveLength(3);
    expect(draft!.sourceUrl).toBe("https://example.com/roast-chicken");

    const salt = draft!.ingredients.find((i) => i.ingredientName === "Salt");
    expect(salt).toBeDefined();
    expect(salt!.quantity).toBeNull();
    expect(salt!.unit).toBeNull();
    expect(salt!.note).toBe("to taste");
    expect(salt!.inferred).toBe(false);

    const oil = draft!.ingredients.find((i) => i.ingredientName === "olive oil");
    expect(oil?.quantity).toBe(2);
    expect(oil?.unit).toBe("tbsp");
  });

  it("parses an @graph-wrapped Recipe with nested HowToSections and no recipeYield", () => {
    const html = loadFixture("jsonld-graph-no-yield.html");
    const draft = extractRecipeFromJsonLd(html, "https://example.com/lentil-soup");

    expect(draft).not.toBeNull();
    expect(draft!.title).toBe("Grandma's Lentil Soup");
    // SPEC: missing servings must surface as null, not a guessed default.
    expect(draft!.servings).toBeNull();
    // Both HowToSections' steps should be flattened into one ordered list.
    expect(draft!.steps.map((s) => s.text)).toEqual([
      "Dice the onion and chop the carrots.",
      "Rinse the lentils.",
      "Simmer everything together for 25 minutes.",
    ]);
  });

  it("returns null when there is no JSON-LD Recipe node", () => {
    const html = loadFixture("no-jsonld.html");
    expect(extractRecipeFromJsonLd(html, "https://example.com/pancakes")).toBeNull();
  });
});
