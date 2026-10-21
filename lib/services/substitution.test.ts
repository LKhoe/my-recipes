import { describe, expect, it } from "vitest";
import { findRecipeIngredient, ingredientKey, parseSubstitutionReply, recipeAlternativesFor } from "./substitution";
import type { RecipeIngredientInput } from "@/types";

const row = (ingredientName: string, extra: Partial<RecipeIngredientInput> = {}): RecipeIngredientInput => ({
  ingredientName,
  quantity: 100,
  unit: "g",
  note: null,
  ...extra,
});

describe("ingredientKey", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(ingredientKey("  Açúcar   Mascavo ")).toBe("acucar mascavo");
  });
});

describe("findRecipeIngredient", () => {
  const items = [row("farinha de trigo"), row("açúcar"), row("cream cheese light")];

  it("matches the same name, accents aside", () => {
    expect(findRecipeIngredient(items, "acucar")?.ingredientName).toBe("açúcar");
  });

  it("matches a name containing the query, or contained in it", () => {
    expect(findRecipeIngredient(items, "cream cheese")?.ingredientName).toBe("cream cheese light");
    expect(findRecipeIngredient(items, "a farinha de trigo")?.ingredientName).toBe("farinha de trigo");
  });

  it("is null when nothing matches", () => {
    expect(findRecipeIngredient(items, "ovo")).toBeNull();
    expect(findRecipeIngredient(items, " ")).toBeNull();
  });
});

describe("recipeAlternativesFor", () => {
  const items = [
    row("manteiga", { group: "Massa" }),
    row("margarina", { group: "Massa", alternative: true }),
    row("óleo", { group: "Massa", alternative: true, quantity: 80, unit: "ml" }),
    row("açúcar", { group: "Massa" }),
  ];

  it("offers the recipe's other 'or' options", () => {
    expect(recipeAlternativesFor(items, items[0]).map((s) => s.name)).toEqual(["margarina", "óleo"]);
    // Asking about an option offers the main ingredient and the remaining options.
    expect(recipeAlternativesFor(items, items[2])).toEqual([
      { name: "manteiga", quantity: 100, unit: "g", note: null },
      { name: "margarina", quantity: 100, unit: "g", note: null },
    ]);
  });

  it("has nothing for an ingredient without options", () => {
    expect(recipeAlternativesFor(items, items[3])).toEqual([]);
  });
});

describe("parseSubstitutionReply", () => {
  it("cleans the model's suggestions", () => {
    const reply = {
      suggestions: [
        { name: " Iogurte Natural ", quantity: 200, unit: "gramas", note: " escorra antes " },
        { name: "cream cheese", quantity: 1, unit: "g" },
        { name: "ricota", quantity: null, unit: "g" },
        { name: "requeijão" },
        { name: "mascarpone" },
      ],
      tip: "  Fica menos firme. ",
    };
    expect(parseSubstitutionReply(reply, "cream cheese")).toEqual({
      suggestions: [
        { name: "iogurte natural", quantity: 200, unit: "g", note: "escorra antes" },
        { name: "ricota", quantity: null, unit: null, note: null },
        { name: "requeijão", quantity: null, unit: null, note: null },
      ],
      tip: "Fica menos firme.",
    });
  });

  it("accepts 'no good substitute'", () => {
    expect(parseSubstitutionReply({ suggestions: [], tip: "Não há substituto." }, "ovo")).toEqual({
      suggestions: [],
      tip: "Não há substituto.",
    });
  });

  it("is null for a reply of the wrong shape", () => {
    expect(parseSubstitutionReply({ suggestions: "ricota" }, "x")).toBeNull();
    expect(parseSubstitutionReply(null, "x")).toBeNull();
  });
});
