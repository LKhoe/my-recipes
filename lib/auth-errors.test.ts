import { describe, expect, it } from "vitest";
import { INVITE_REQUIRED_MESSAGE, isInviteRequiredError } from "./auth-errors";

describe("isInviteRequiredError", () => {
  it("recognizes the refused Google sign-up as Better Auth sends it back", () => {
    // better-auth's oauth callback: result.error.split(" ").join("_"), then URLSearchParams
    const fromCallback = INVITE_REQUIRED_MESSAGE.split(" ").join("_");
    const query = new URLSearchParams({ error: fromCallback }).toString();
    expect(isInviteRequiredError(new URLSearchParams(query).get("error"))).toBe(true);
  });

  it("recognizes the hook's error code", () => {
    expect(isInviteRequiredError("INVALID_INVITE_CODE")).toBe(true);
  });

  it("ignores other errors and no error", () => {
    expect(isInviteRequiredError("access_denied")).toBe(false);
    expect(isInviteRequiredError(null)).toBe(false);
  });
});
