import { describe, expect, it } from "vitest";
import { cleanAlternativeFlags, groupAlternatives, sharesAmount } from "./ingredient-alternatives";

const rows = <T>(items: T[]) => items.map((item, index) => ({ item, index }));

describe("groupAlternatives", () => {
  it("folds each run of options into the row above it", () => {
    const choices = groupAlternatives(
      rows([{ n: "manteiga" }, { n: "margarina", alternative: true }, { n: "óleo", alternative: true }, { n: "sal" }]),
    );
    expect(choices.map((c) => [c.primary.index, c.alternatives.map((a) => a.index)])).toEqual([
      [0, [1, 2]],
      [3, []],
    ]);
  });

  it("treats an option with nothing above it as a plain ingredient", () => {
    const choices = groupAlternatives(rows([{ n: "margarina", alternative: true }]));
    expect(choices).toHaveLength(1);
    expect(choices[0].alternatives).toEqual([]);
  });
});

describe("cleanAlternativeFlags", () => {
  it("clears the flag on the first row and on the first row of a section", () => {
    const cleaned = cleanAlternativeFlags([
      { alternative: true, group: null },
      { alternative: true, group: null },
      { alternative: true, group: "Recheio" },
      { alternative: false, group: "Recheio" },
    ]);
    expect(cleaned.map((r) => r.alternative)).toEqual([false, true, false, false]);
  });
});

describe("sharesAmount", () => {
  it("compares quantity and unit", () => {
    expect(sharesAmount({ quantity: 100, unit: "g" }, { quantity: 100, unit: "g" })).toBe(true);
    expect(sharesAmount({ quantity: 100, unit: "g" }, { quantity: 0.5, unit: "xíc" })).toBe(false);
    expect(sharesAmount({ quantity: null, unit: null }, { quantity: null, unit: null })).toBe(true);
  });
});
