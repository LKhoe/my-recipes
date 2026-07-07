import { describe, expect, it } from "vitest";
import { normalizeUnit, parseIngredientLine } from "./ingredient-parser";

describe("parseIngredientLine", () => {
  it("parses a mixed-fraction quantity with unit and note", () => {
    expect(parseIngredientLine("2 1/2 xíc farinha, peneirada")).toEqual({
      quantity: 2.5,
      unit: "xíc",
      name: "farinha",
      note: "peneirada",
    });
  });

  it("parses a plain decimal with a metric unit", () => {
    expect(parseIngredientLine("300g manteiga, derretida")).toEqual({
      quantity: 300,
      unit: "g",
      name: "manteiga",
      note: "derretida",
    });
  });

  it("parses a multi-word unit phrase (colher de sopa)", () => {
    expect(parseIngredientLine("2 colheres de sopa azeite")).toEqual({
      quantity: 2,
      unit: "csp",
      name: "azeite",
      note: null,
    });
  });

  it("handles unquantified 'a gosto' ingredients (SPEC §4.3)", () => {
    const result = parseIngredientLine("Sal, a gosto");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.name).toBe("Sal");
    expect(result.note).toBe("a gosto");
  });

  it("parses a unicode fraction", () => {
    expect(parseIngredientLine("½ cch canela")).toEqual({
      quantity: 0.5,
      unit: "cch",
      name: "canela",
      note: null,
    });
  });

  it("takes the lower bound of a range", () => {
    const result = parseIngredientLine("2-3 maçãs, descascadas e sem caroço");
    expect(result.quantity).toBe(2);
    expect(result.name).toBe("maçãs");
    expect(result.note).toBe("descascadas e sem caroço");
  });

  it("parses a bare count with no unit", () => {
    expect(parseIngredientLine("3 ovos")).toEqual({
      quantity: 3,
      unit: null,
      name: "ovos",
      note: null,
    });
  });

  it("extracts a parenthetical as a note", () => {
    const result = parseIngredientLine("1 lata (400g) de tomate picado");
    expect(result.quantity).toBe(1);
    expect(result.note).toBe("400g");
  });

  it("falls back to treating the whole line as the name when no quantity is found", () => {
    const result = parseIngredientLine("Salsinha fresca, para decorar");
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.name).toBe("Salsinha fresca");
    expect(result.note).toBe("para decorar");
  });

  it("normalizes English unit words to the canonical pt-BR token (JSON-LD import from English-language sites)", () => {
    expect(parseIngredientLine("2 tbsp olive oil")).toEqual({
      quantity: 2,
      unit: "csp",
      name: "olive oil",
      note: null,
    });
    expect(parseIngredientLine("1 cup flour")).toEqual({
      quantity: 1,
      unit: "xíc",
      name: "flour",
      note: null,
    });
    expect(parseIngredientLine("3 cloves garlic")).toEqual({
      quantity: 3,
      unit: "dente",
      name: "garlic",
      note: null,
    });
  });
});

describe("normalizeUnit", () => {
  it("normalizes known raw variants observed in the dev DB to their canonical token", () => {
    expect(normalizeUnit("colher de sopa")).toBe("csp");
    expect(normalizeUnit("colheres (sopa)")).toBe("csp");
    expect(normalizeUnit("colheres")).toBe("csp");
    expect(normalizeUnit("fatias")).toBe("fatia");
    expect(normalizeUnit("dentes")).toBe("dente");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeUnit("  Colheres (Sopa)  ")).toBe("csp");
    expect(normalizeUnit(" G ")).toBe("g");
  });

  it("stores an unrecognized unit as-typed (trimmed/lowercased) rather than rejecting it", () => {
    expect(normalizeUnit("gomos")).toBe("gomos");
  });

  it("returns null for null, undefined, or empty input", () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit(undefined)).toBeNull();
    expect(normalizeUnit("")).toBeNull();
    expect(normalizeUnit("   ")).toBeNull();
  });
});
