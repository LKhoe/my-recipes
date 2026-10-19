import { describe, expect, it } from "vitest";
import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it.each(["/", "/recipes", "/recipes/", "/recipes/abc-123", "/recipes/abc-123/cook", "/login", "/reset-password"])(
    "lets %s through without a session",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each([
    "/recipes/new",
    "/recipes/abc-123/edit",
    "/plan",
    "/shopping-list",
    "/settings",
    "/recipesx",
    "/recipes/abc/cook/extra",
  ])("sends %s to login without a session", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
