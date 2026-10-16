import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { normalizeIngredientName } from "./ingredient";

describe("normalizeIngredientName", () => {
  it("lowercases, trims, collapses spaces and singularizes the last word", () => {
    expect(normalizeIngredientName("  Chicken   Breasts ")).toBe("chicken breast");
    expect(normalizeIngredientName("Tomates")).toBe("tomate");
  });

  it("treats hyphens as spaces so spelling variants become one ingredient", () => {
    expect(normalizeIngredientName("pimenta-do-reino")).toBe(normalizeIngredientName("pimenta do reino"));
    expect(normalizeIngredientName("Cheiro-Verde")).toBe("cheiro verde");
    expect(normalizeIngredientName("couve - flor")).toBe("couve flor");
    expect(normalizeIngredientName("pimentas-do-reino")).toBe("pimentas do reino");
  });
});
