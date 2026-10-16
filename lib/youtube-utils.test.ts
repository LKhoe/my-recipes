import { describe, expect, it } from "vitest";
import { cleanVideoTitle } from "./youtube-utils";

describe("cleanVideoTitle", () => {
  it("drops the channel suffix and turns an all-caps title into sentence case", () => {
    expect(cleanVideoTitle("CORAÇÃO DE BOI ACEBOLADO// receitas,casa e coisas.")).toBe("Coração de boi acebolado");
    expect(cleanVideoTitle("Bolo de cenoura fofinho | Canal da Ana")).toBe("Bolo de cenoura fofinho");
  });

  it("keeps the casing of a title that is not mostly capitals", () => {
    expect(cleanVideoTitle("Pão de queijo mineiro da Vó Maria")).toBe("Pão de queijo mineiro da Vó Maria");
    expect(cleanVideoTitle("Bolo de cenoura com cobertura de Nutella")).toBe("Bolo de cenoura com cobertura de Nutella");
  });

  it("keeps the whole title when nothing comes before the separator", () => {
    expect(cleanVideoTitle("| Receita rápida")).toBe("| Receita rápida");
  });

  it("returns an empty string for an empty title", () => {
    expect(cleanVideoTitle("")).toBe("");
  });
});
