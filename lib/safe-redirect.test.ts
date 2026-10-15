import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin relative paths, including query and hash", () => {
    expect(safeRedirectPath("/recipes")).toBe("/recipes");
    expect(safeRedirectPath("/recipes/abc-123")).toBe("/recipes/abc-123");
    expect(safeRedirectPath("/shopping-list?week=2")).toBe("/shopping-list?week=2");
    expect(safeRedirectPath("/plan#today")).toBe("/plan#today");
  });

  it("falls back to /recipes when the param is missing or empty", () => {
    expect(safeRedirectPath(null)).toBe("/recipes");
    expect(safeRedirectPath(undefined)).toBe("/recipes");
    expect(safeRedirectPath("")).toBe("/recipes");
  });

  it("rejects absolute URLs to other sites", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/recipes");
    expect(safeRedirectPath("http://evil.example/recipes")).toBe("/recipes");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/recipes");
    expect(safeRedirectPath("recipes")).toBe("/recipes");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/recipes");
    expect(safeRedirectPath("/\\evil.example")).toBe("/recipes");
    expect(safeRedirectPath("/\t/evil.example")).toBe("/recipes");
    expect(safeRedirectPath("/\n/evil.example")).toBe("/recipes");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/")).toBe("/");
  });
});
