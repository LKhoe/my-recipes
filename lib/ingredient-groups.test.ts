import { describe, expect, it } from "vitest";
import { groupIngredientSections, normalizeGroupLabel } from "./ingredient-groups";

describe("normalizeGroupLabel", () => {
  it.each([
    ["CALDO:", "Caldo"],
    ["RISOTO", "Risoto"],
    ["Para o recheio", "Recheio"],
    ["para a massa:", "Massa"],
    ["  Molho de tomate  ", "Molho de tomate"],
    ["Molho Bechamel", "Molho Bechamel"],
    ["cobertura", "Cobertura"],
    ["Ingredientes:", null],
    ["   ", null],
    [null, null],
    [undefined, null],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeGroupLabel(input)).toBe(expected);
  });
});

describe("groupIngredientSections", () => {
  it("keeps a flat recipe as one section with no heading", () => {
    const sections = groupIngredientSections([{ name: "sal" }, { name: "ovo", group: null }]);
    expect(sections).toHaveLength(1);
    expect(sections[0].group).toBeNull();
    expect(sections[0].rows.map((r) => r.index)).toEqual([0, 1]);
  });

  it("splits consecutive runs by label, keeping each row's flat-list index", () => {
    const sections = groupIngredientSections([
      { name: "cebola", group: "Caldo" },
      { name: "cenoura", group: "Caldo" },
      { name: "cebola", group: "Risoto" },
      { name: "arroz", group: "Risoto" },
      { name: "sal", group: null },
    ]);
    expect(sections.map((s) => [s.group, s.rows.map((r) => r.index)])).toEqual([
      ["Caldo", [0, 1]],
      ["Risoto", [2, 3]],
      [null, [4]],
    ]);
  });

  it("treats a blank label (a heading still being typed) as its own section", () => {
    const sections = groupIngredientSections([{ group: null }, { group: "" }]);
    expect(sections.map((s) => s.group)).toEqual([null, ""]);
  });

  it("returns no sections for no ingredients", () => {
    expect(groupIngredientSections([])).toEqual([]);
  });
});
