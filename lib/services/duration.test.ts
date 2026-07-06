import { describe, expect, it } from "vitest";
import { parseIso8601DurationToMinutes } from "./duration";

describe("parseIso8601DurationToMinutes", () => {
  it("parses minutes only", () => {
    expect(parseIso8601DurationToMinutes("PT15M")).toBe(15);
  });

  it("parses hours and minutes", () => {
    expect(parseIso8601DurationToMinutes("PT1H30M")).toBe(90);
  });

  it("parses hours only", () => {
    expect(parseIso8601DurationToMinutes("PT2H")).toBe(120);
  });

  it("parses days", () => {
    expect(parseIso8601DurationToMinutes("P1DT2H")).toBe(24 * 60 + 120);
  });

  it("returns null for missing input", () => {
    expect(parseIso8601DurationToMinutes(null)).toBeNull();
    expect(parseIso8601DurationToMinutes(undefined)).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseIso8601DurationToMinutes("not a duration")).toBeNull();
  });
});
