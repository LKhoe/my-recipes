import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "./ingredient-parser";

describe("parseIngredientLine", () => {
  it("parses a mixed-fraction quantity with unit and note", () => {
    expect(parseIngredientLine("2 1/2 cups flour, sifted")).toEqual({
      quantity: 2.5,
      unit: "cup",
      name: "flour",
      note: "sifted",
    });
  });

  it("parses a plain decimal with a metric unit", () => {
    expect(parseIngredientLine("300g butter, melted")).toEqual({
      quantity: 300,
      unit: "g",
      name: "butter",
      note: "melted",
    });
  });

  it("handles unquantified 'to taste' ingredients (SPEC §4.3)", () => {
    const result = parseIngredientLine("Salt, to taste");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.name).toBe("Salt");
    expect(result.note).toBe("to taste");
  });

  it("parses a unicode fraction", () => {
    expect(parseIngredientLine("½ tsp cinnamon")).toEqual({
      quantity: 0.5,
      unit: "tsp",
      name: "cinnamon",
      note: null,
    });
  });

  it("takes the lower bound of a range", () => {
    const result = parseIngredientLine("2-3 apples, peeled and cored");
    expect(result.quantity).toBe(2);
    expect(result.name).toBe("apples");
    expect(result.note).toBe("peeled and cored");
  });

  it("parses a bare count with no unit", () => {
    expect(parseIngredientLine("3 eggs")).toEqual({
      quantity: 3,
      unit: null,
      name: "eggs",
      note: null,
    });
  });

  it("extracts a parenthetical as a note", () => {
    const result = parseIngredientLine("1 can (400g) chopped tomatoes");
    expect(result.quantity).toBe(1);
    expect(result.note).toBe("400g");
  });

  it("falls back to treating the whole line as the name when no quantity is found", () => {
    const result = parseIngredientLine("Fresh basil leaves, for garnish");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.name).toBe("Fresh basil leaves");
    expect(result.note).toBe("for garnish");
  });
});
