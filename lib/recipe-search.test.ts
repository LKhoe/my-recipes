import { describe, expect, it } from "vitest";
import {
  AUTO_START_MIN_MARGIN,
  MAX_SEARCH_QUERY_LENGTH,
  cleanSearchQuery,
  escapeLike,
  foldForSearch,
  pickConfidentMatch,
} from "./recipe-search";

describe("cleanSearchQuery", () => {
  it("trims, collapses spaces and handles null", () => {
    expect(cleanSearchQuery("  bolo   de \n cenoura ")).toBe("bolo de cenoura");
    expect(cleanSearchQuery(null)).toBe("");
    expect(cleanSearchQuery(undefined)).toBe("");
  });
  it("caps the length", () => {
    expect(cleanSearchQuery("a".repeat(500))).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
    expect(cleanSearchQuery(`${"a".repeat(99)} b`)).toBe("a".repeat(99));
  });
});

describe("escapeLike", () => {
  it("escapes the LIKE metacharacters", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
    expect(escapeLike("bolo")).toBe("bolo");
  });
});

describe("foldForSearch", () => {
  it("drops accents and case", () => {
    expect(foldForSearch("  Pão de Queijo  Mineiro")).toBe("pao de queijo mineiro");
    expect(foldForSearch("AÇAÍ")).toBe("acai");
  });
});

describe("pickConfidentMatch", () => {
  it("picks a strong, clear winner", () => {
    const best = { id: "a", score: 1 };
    expect(pickConfidentMatch([best, { id: "b", score: 0.5 }])).toBe(best);
    expect(pickConfidentMatch([best])).toBe(best);
  });
  it("refuses weak matches, ties and missing scores", () => {
    expect(pickConfidentMatch([{ score: 0.6 }])).toBeNull();
    expect(pickConfidentMatch([{ score: 1 }, { score: 1 }])).toBeNull();
    expect(pickConfidentMatch([{ score: 0.9 }, { score: 0.9 - AUTO_START_MIN_MARGIN + 0.01 }])).toBeNull();
    expect(pickConfidentMatch([])).toBeNull();
    expect(pickConfidentMatch([{} as { score: number }])).toBeNull();
  });
});
