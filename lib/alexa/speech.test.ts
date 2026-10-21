import { describe, expect, it } from "vitest";
import {
  amountForSpeech,
  chooseSpeech,
  expandAmountsForSpeech,
  cleanRecipeQuery,
  joinList,
  minutesForSpeech,
  parseChoice,
  parseIsoDurationMinutes,
  quantitySentence,
  ssmlEscape,
  stepSpeech,
  substitutionSpeech,
} from "./speech";

describe("amountForSpeech", () => {
  it.each([
    [2, "xíc", "duas xícaras"],
    [1, "xíc", "uma xícara"],
    [0.5, "xíc", "meia xícara"],
    [1.5, "xíc", "uma xícara e meia"],
    [0.25, "xíc", "um quarto de xícara"],
    [2.5, "csp", "duas colheres de sopa e meia"],
    [2, "dente", "dois dentes"],
    [0.5, "kg", "meio quilo"],
    [1.5, "l", "um litro e meio"],
    [3, null, "3"],
  ])("%s %s -> %s", (quantity, unit, expected) => {
    expect(amountForSpeech(quantity, unit)).toBe(expected);
  });

  it("rounds weights and volumes instead of reading fractions", () => {
    expect(amountForSpeech(266.67, "g")).toBe("267 gramas");
    expect(amountForSpeech(1.3, "l")).toBe("1,3 litro");
    expect(amountForSpeech(0.333, "kg")).toBe("0,3 quilo");
  });

  it("is null without a quantity", () => {
    expect(amountForSpeech(null, "g")).toBeNull();
    expect(amountForSpeech(0, "g")).toBeNull();
  });
});

describe("expandAmountsForSpeech", () => {
  it("spells out abbreviated amounts in free text", () => {
    expect(expandAmountsForSpeech("Bata com 2 csp de iogurte e 200g de açúcar.")).toBe(
      "Bata com duas colheres de sopa de iogurte e 200 gramas de açúcar.",
    );
    expect(expandAmountsForSpeech("Use 1,5 xíc de leite.")).toBe("Use uma xícara e meia de leite.");
  });

  it("leaves words that only start like a unit alone", () => {
    expect(expandAmountsForSpeech("Junte 2 latas e 3 limões; asse a 180 °C por 40 minutos.")).toBe(
      "Junte 2 latas e 3 limões; asse a 180 °C por 40 minutos.",
    );
  });
});

describe("quantitySentence", () => {
  it("agrees the verb with the amount", () => {
    expect(quantitySentence("açúcar", 2, "xíc", null)).toBe("De açúcar, são duas xícaras.");
    expect(quantitySentence("manteiga", 0.5, "xíc", "derretida")).toBe("De manteiga, é meia xícara, derretida.");
  });

  it("falls back to the note when there's no amount", () => {
    expect(quantitySentence("sal", null, null, "a gosto")).toBe("De sal, a receita diz a gosto.");
    expect(quantitySentence("sal", null, null, null)).toBe("A receita não diz a quantidade de sal.");
  });
});

describe("cleanRecipeQuery", () => {
  it("drops carrier words the SearchQuery slot keeps", () => {
    expect(cleanRecipeQuery("a receita de Cheesecake.")).toBe("Cheesecake");
    expect(cleanRecipeQuery("um bolo de cenoura")).toBe("bolo de cenoura");
    expect(cleanRecipeQuery("preparo do pudim")).toBe("pudim");
    expect(cleanRecipeQuery("  ")).toBe("");
    expect(cleanRecipeQuery(null)).toBe("");
  });

  it("keeps a dish name that merely starts with an article-like word", () => {
    expect(cleanRecipeQuery("arroz de forno")).toBe("arroz de forno");
  });
});

describe("parseChoice", () => {
  it("reads the number slot first", () => {
    expect(parseChoice("2", "primeira")).toBe(2);
  });

  it("reads a resolved ordinal id or the spoken word", () => {
    expect(parseChoice(null, "3")).toBe(3);
    expect(parseChoice(null, "-1")).toBe(-1);
    expect(parseChoice(null, "segunda")).toBe(2);
    expect(parseChoice(null, "a Última")).toBe(-1);
  });

  it("is null when nothing usable was said", () => {
    expect(parseChoice(null, null)).toBeNull();
    expect(parseChoice("?", "banana")).toBeNull();
  });
});

describe("durations", () => {
  it("parses AMAZON.DURATION values", () => {
    expect(parseIsoDurationMinutes("PT40M")).toBe(40);
    expect(parseIsoDurationMinutes("PT1H30M")).toBe(90);
    expect(parseIsoDurationMinutes("PT90S")).toBe(1.5);
    expect(parseIsoDurationMinutes("PT0M")).toBeNull();
    expect(parseIsoDurationMinutes("?")).toBeNull();
    expect(parseIsoDurationMinutes(null)).toBeNull();
  });

  it("speaks minutes as hours and minutes", () => {
    expect(minutesForSpeech(40)).toBe("40 minutos");
    expect(minutesForSpeech(60)).toBe("1 hora");
    expect(minutesForSpeech(90)).toBe("1 hora e 30 minutos");
    expect(minutesForSpeech(1)).toBe("1 minuto");
  });
});

describe("sentences", () => {
  it("joins lists the pt-BR way", () => {
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b", "c"], "ou")).toBe("a, b ou c");
  });

  it("names the last step and offers a timer only when the step has a time", () => {
    expect(stepSpeech(0, 3, "Misture tudo.")).toBe("Passo 1. Misture tudo.");
    expect(stepSpeech(2, 3, "Asse.", 40)).toBe('Último passo. Asse. Esse passo leva 40 minutos. Diga "marcar timer" quando quiser.');
  });

  it("numbers the options to choose from", () => {
    expect(chooseSpeech(["Cheesecake", "Cheesecake de frutas vermelhas"])).toBe(
      "Achei 2 receitas. 1: Cheesecake; 2: Cheesecake de frutas vermelhas. Qual delas?",
    );
  });

  it("reads substitutes scaled to the kitchen's servings", () => {
    const speech = substitutionSpeech(
      "cream cheese",
      "ai",
      [
        { name: "ricota", quantity: 200, unit: "g", note: "bata até ficar lisa" },
        { name: "requeijão", quantity: null, unit: null, note: null },
      ],
      "Fica um pouco menos firme.",
      2,
    );
    expect(speech).toBe(
      "No lugar de cream cheese, você pode usar 400 gramas de ricota ou requeijão. Bata até ficar lisa. Fica um pouco menos firme.",
    );
  });

  it("says when there's no good substitute", () => {
    expect(substitutionSpeech("ovo", "ai", [], null, 1)).toBe("Não encontrei um bom substituto para ovo.");
    expect(substitutionSpeech("ovo", "ai", [], "Ovo é a base do prato.", 1)).toBe("Ovo é a base do prato.");
  });

  it("escapes SSML markup", () => {
    expect(ssmlEscape('Leve ao forno a <180 °C> & "sirva"')).toBe('Leve ao forno a &lt;180 °C&gt; &amp; "sirva"');
  });
});
