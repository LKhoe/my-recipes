import { describe, expect, it } from "vitest";
import { cleanImportedIngredients, cleanIngredientName, cleanRecipeTitle, removeBrands } from "./import-cleanup";

describe("cleanRecipeTitle", () => {
  it.each([
    ["Receita de Bolo de cenoura", "Bolo de cenoura"],
    ["Receita de pão de queijo", "Pão de queijo"],
    ["receita fácil de brigadeiro", "Brigadeiro"],
    ["Receita fácil e rápida de pudim", "Pudim"],
    ["Receita: Lasanha à bolonhesa", "Lasanha à bolonhesa"],
    ["Como fazer um pudim de leite", "Pudim de leite"],
    ["Aprenda a fazer coxinha", "Coxinha"],
    ["Bolo de fubá - Receita", "Bolo de fubá"],
    ["Pudim | Receitas Nestlé", "Pudim"],
    ["Coxinha (receita)", "Coxinha"],
    ["Bolo de cenoura", "Bolo de cenoura"],
    ["Receitas", "Receitas"],
    ["Torta da receita da vovó", "Torta da receita da vovó"],
  ])("%j -> %j", (input, expected) => {
    expect(cleanRecipeTitle(input)).toBe(expected);
  });
});

describe("removeBrands", () => {
  it.each([
    ["creme de leite Nestlé", "creme de leite"],
    ["creme de leite da Nestlé", "creme de leite"],
    ["Leite Moça", "Leite condensado"],
    ["1 lata de leite moça", "1 lata de leite condensado"],
    ["amido de milho (Maizena)", "amido de milho"],
    ["Maizena", "Amido de milho"],
    ["achocolatado Nescau", "achocolatado em pó"],
    ["requeijão Catupiry", "requeijão cremoso"],
    ["fermento em pó Royal", "fermento em pó"],
    ["caldo de galinha Knorr", "caldo de galinha"],
    ["Misture o creme de leite Itambé com o açúcar.", "Misture o creme de leite com o açúcar."],
    // Ordinary words that happen to be brands elsewhere stay.
    ["Mexa com vigor até engrossar.", "Mexa com vigor até engrossar."],
    ["Deixe o sol secar os tomates", "Deixe o sol secar os tomates"],
  ])("%j -> %j", (input, expected) => {
    expect(removeBrands(input)).toBe(expected);
  });
});

describe("cleanIngredientName", () => {
  it.each([
    ["de farinha de trigo", "farinha de trigo"],
    ["da farinha", "farinha"],
    ["of flour", "flour"],
    ["doce de leite", "doce de leite"],
    ["dendê", "dendê"],
    ["leite condensado Nestlé", "leite condensado"],
  ])("%j -> %j", (input, expected) => {
    expect(cleanIngredientName(input)).toBe(expected);
  });
});

describe("cleanImportedIngredients", () => {
  const base = { quantity: null, unit: null, note: null };

  it("splits 'manteiga ou margarina' into the ingredient and an option with the same amount", () => {
    expect(
      cleanImportedIngredients([{ ingredientName: "manteiga ou margarina", quantity: 100, unit: "g", note: null, group: "Massa" }]),
    ).toEqual([
      { ingredientName: "manteiga", quantity: 100, unit: "g", note: null, group: "Massa" },
      { ingredientName: "margarina", quantity: 100, unit: "g", note: null, group: "Massa", alternative: true, inferred: false },
    ]);
  });

  it("gives the option its own amount when it states one", () => {
    const [primary, option] = cleanImportedIngredients([
      { ingredientName: "manteiga ou 1/2 xícara de óleo", quantity: 100, unit: "g", note: null },
    ]);
    expect(primary).toMatchObject({ ingredientName: "manteiga", quantity: 100, unit: "g" });
    expect(option).toMatchObject({ ingredientName: "óleo", quantity: 0.5, unit: "xíc", alternative: true });
  });

  it("reads an option from a note that starts with 'ou'", () => {
    const result = cleanImportedIngredients([{ ...base, ingredientName: "leite", quantity: 1, unit: "xíc", note: "ou água" }]);
    expect(result).toEqual([
      { ingredientName: "leite", quantity: 1, unit: "xíc", note: null },
      { ingredientName: "água", quantity: 1, unit: "xíc", note: null, group: undefined, alternative: true, inferred: false },
    ]);
  });

  it("leaves an 'ou' inside parentheses and rows that are already options alone", () => {
    expect(cleanImportedIngredients([{ ...base, ingredientName: "leite (ou água)" }])[0].ingredientName).toBe(
      "leite (ou água)",
    );
    expect(cleanImportedIngredients([{ ...base, ingredientName: "pimenta", alternative: true }])).toHaveLength(1);
  });

  it("drops brands from names and notes, and a name left empty", () => {
    expect(
      cleanImportedIngredients([
        { ...base, ingredientName: "creme de leite", note: "Nestlé" },
        { ...base, ingredientName: "Nestlé" },
      ]),
    ).toEqual([{ ...base, ingredientName: "creme de leite", note: null }]);
  });
});
