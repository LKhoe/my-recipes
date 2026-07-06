import { describe, expect, it } from "vitest";
import { addDays, formatDateISO, getWeekDays, getWeekStart } from "./date-utils";

describe("formatDateISO", () => {
  it("formats using local date components, not UTC", () => {
    // A date constructed at local midnight must not shift backwards a day.
    const date = new Date(2026, 2, 1); // March 1, 2026, local midnight
    expect(formatDateISO(date)).toBe("2026-03-01");
  });
});

describe("getWeekStart", () => {
  it("returns the same Monday for any day within that week", () => {
    // 2026-03-02 is a Monday.
    expect(formatDateISO(getWeekStart(new Date(2026, 2, 2)))).toBe("2026-03-02");
    expect(formatDateISO(getWeekStart(new Date(2026, 2, 4)))).toBe("2026-03-02"); // Wednesday
    expect(formatDateISO(getWeekStart(new Date(2026, 2, 8)))).toBe("2026-03-02"); // Sunday
  });
});

describe("getWeekDays", () => {
  it("returns 7 consecutive days starting from the given date", () => {
    const days = getWeekDays(new Date(2026, 2, 2));
    expect(days.map(formatDateISO)).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ]);
  });
});

describe("addDays", () => {
  it("adds days correctly across a month boundary", () => {
    expect(formatDateISO(addDays(new Date(2026, 2, 30), 3))).toBe("2026-04-02");
  });
});
