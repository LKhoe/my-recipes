import { describe, expect, it } from "vitest";
import { formatCountdown, formatIngredientChoice, formatIngredientLine } from "./format";

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

describe("formatCountdown", () => {
  it("shows minutes and seconds under an hour", () => {
    expect(formatCountdown(25 * 60)).toBe("25:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("shows hours as h:mm:ss from one hour up", () => {
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(90 * 60 + 5)).toBe("1:30:05");
    expect(formatCountdown(20160 * 60)).toBe("336:00:00");
  });
});

describe("formatIngredientChoice", () => {
  const item = (ingredientName: string, quantity: number | null, unit: string | null, note: string | null = null) => ({
    ingredientName,
    quantity,
    unit,
    note,
  });

  it("says a shared amount once", () => {
    expect(formatIngredientChoice(item("manteiga", 100, "g"), [item("margarina", 100, "g")])).toBe(
      "100 g manteiga ou margarina",
    );
  });

  it("gives an option its own amount when it differs, scaled like the rest", () => {
    expect(formatIngredientChoice(item("leite", 1, "xíc"), [item("água", 200, "ml")], 2)).toBe(
      "2 xíc leite ou 400 ml água",
    );
  });

  it("is the plain line when there are no options", () => {
    expect(formatIngredientChoice(item("sal", null, null, "a gosto"), [])).toBe("sal (a gosto)");
  });
});
