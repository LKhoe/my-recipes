import { describe, expect, it } from "vitest";
import { mergeIngredientsForShoppingList } from "./shopping-list-merge";

describe("mergeIngredientsForShoppingList", () => {
  it("merges the same ingredient and unit across recipes (SPEC §4.5 example)", () => {
    const result = mergeIngredientsForShoppingList([
      { ingredientId: "flour", ingredientName: "flour", quantity: 200, unit: "g" },
      { ingredientId: "flour", ingredientName: "flour", quantity: 200, unit: "g" },
    ]);

    expect(result).toEqual([{ ingredientId: "flour", ingredientName: "flour", unit: "g", quantity: 400 }]);
  });

  it("keeps incompatible units as separate lines grouped under the same ingredient", () => {
    const result = mergeIngredientsForShoppingList([
      { ingredientId: "flour", ingredientName: "flour", quantity: 200, unit: "g" },
      { ingredientId: "flour", ingredientName: "flour", quantity: 2, unit: "tbsp" },
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((line) => line.ingredientId === "flour")).toBe(true);
    expect(result.find((l) => l.unit === "g")).toMatchObject({ quantity: 200 });
    expect(result.find((l) => l.unit === "tbsp")).toMatchObject({ quantity: 2 });
  });

  it("collapses all-unquantified duplicates into one no-quantity line", () => {
    const result = mergeIngredientsForShoppingList([
      { ingredientId: "salt", ingredientName: "salt", quantity: null, unit: null },
      { ingredientId: "salt", ingredientName: "salt", quantity: null, unit: null },
    ]);

    expect(result).toEqual([{ ingredientId: "salt", ingredientName: "salt", unit: null, quantity: null }]);
  });

  it("sums quantified items and ignores an unquantified one in the same bucket", () => {
    const result = mergeIngredientsForShoppingList([
      { ingredientId: "salt", ingredientName: "salt", quantity: 1, unit: "tsp" },
      { ingredientId: "salt", ingredientName: "salt", quantity: null, unit: "tsp" },
    ]);

    expect(result).toEqual([{ ingredientId: "salt", ingredientName: "salt", unit: "tsp", quantity: 1 }]);
  });

  it("treats a bare count and a real unit as incompatible", () => {
    const result = mergeIngredientsForShoppingList([
      { ingredientId: "egg", ingredientName: "egg", quantity: 2, unit: null },
      { ingredientId: "egg", ingredientName: "egg", quantity: 100, unit: "g" },
    ]);

    expect(result).toHaveLength(2);
  });

  it("keeps different ingredients fully separate", () => {
    const result = mergeIngredientsForShoppingList([
      { ingredientId: "flour", ingredientName: "flour", quantity: 200, unit: "g" },
      { ingredientId: "sugar", ingredientName: "sugar", quantity: 100, unit: "g" },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((l) => l.ingredientId).sort()).toEqual(["flour", "sugar"]);
  });

  it("returns an empty list for no items", () => {
    expect(mergeIngredientsForShoppingList([])).toEqual([]);
  });
});
