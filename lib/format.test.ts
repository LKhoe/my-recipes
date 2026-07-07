import { describe, expect, it } from "vitest";
import { formatIngredientLine } from "./format";

describe("formatIngredientLine", () => {
  it("formats an unscaled ingredient line with unit and note", () => {
    expect(
      formatIngredientLine({ quantity: 200, unit: "g", ingredientName: "farinha", note: "peneirada" }),
    ).toBe("200 g farinha (peneirada)");
  });

  it("multiplies the quantity by the given factor (feature: scale ingredients by a factor)", () => {
    expect(formatIngredientLine({ quantity: 200, unit: "g", ingredientName: "farinha", note: null }, 2)).toBe(
      "400 g farinha",
    );
    expect(formatIngredientLine({ quantity: 2, unit: null, ingredientName: "ovo", note: null }, 1.5)).toBe("3 ovo");
  });

  it("leaves an unquantified ingredient alone regardless of factor", () => {
    expect(formatIngredientLine({ quantity: null, unit: null, ingredientName: "sal", note: "a gosto" }, 3)).toBe(
      "sal (a gosto)",
    );
  });

  it("defaults to a factor of 1 when none is given", () => {
    expect(formatIngredientLine({ quantity: 3, unit: "unidade", ingredientName: "limão", note: null })).toBe(
      "3 unidade limão",
    );
  });
});
