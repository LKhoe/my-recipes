import { describe, expect, it } from "vitest";
import { formatScaledQuantity, scaleQuantity } from "./scale";

describe("scaleQuantity", () => {
  it("scales proportionally", () => {
    expect(scaleQuantity(200, 4, 8)).toBe(400);
    expect(scaleQuantity(3, 4, 2)).toBe(1.5);
  });

  it("returns the original quantity when there's no baseline to scale from", () => {
    expect(scaleQuantity(200, 0, 8)).toBe(200);
  });
});

describe("formatScaledQuantity", () => {
  it("formats a countable unit as a mixed fraction (SPEC §4.3 example)", () => {
    expect(formatScaledQuantity(1.33, null)).toBe("1⅓");
  });

  it("formats bare counts without a unit", () => {
    expect(formatScaledQuantity(0.5, null)).toBe("½");
    expect(formatScaledQuantity(2, null)).toBe("2");
  });

  it("rounds weights/volumes to practical precision (SPEC §4.3 example)", () => {
    expect(formatScaledQuantity(266.666, "g")).toBe("267");
  });

  it("keeps a decimal for small weight values, using a comma (pt-BR)", () => {
    expect(formatScaledQuantity(2.5, "g")).toBe("2,5");
  });

  it("treats xíc/csp/cch as fraction-friendly", () => {
    expect(formatScaledQuantity(1.5, "xíc")).toBe("1½");
    expect(formatScaledQuantity(0.75, "cch")).toBe("¾");
  });

  it("rounds a fraction close to the next whole number up", () => {
    expect(formatScaledQuantity(1.97, null)).toBe("2");
  });

  it("returns an empty string for a null quantity", () => {
    expect(formatScaledQuantity(null, "g")).toBe("");
  });
});
