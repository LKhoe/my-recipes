import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedAlexaRequest } from "./alexa-auth";

function requestWithAuth(header?: string): NextRequest {
  return new NextRequest("http://localhost/api/alexa/active-recipe", {
    headers: header ? { authorization: header } : {},
  });
}

describe("isAuthorizedAlexaRequest", () => {
  const originalToken = process.env.ALEXA_API_TOKEN;

  afterEach(() => {
    process.env.ALEXA_API_TOKEN = originalToken;
  });

  it("accepts the correct bearer token", () => {
    process.env.ALEXA_API_TOKEN = "correct-token-value";
    expect(isAuthorizedAlexaRequest(requestWithAuth("Bearer correct-token-value"))).toBe(true);
  });

  it("rejects a wrong token", () => {
    process.env.ALEXA_API_TOKEN = "correct-token-value";
    expect(isAuthorizedAlexaRequest(requestWithAuth("Bearer wrong-token-value"))).toBe(false);
  });

  it("rejects a token that differs only in length from the correct one", () => {
    process.env.ALEXA_API_TOKEN = "correct-token-value";
    expect(isAuthorizedAlexaRequest(requestWithAuth("Bearer short"))).toBe(false);
    expect(isAuthorizedAlexaRequest(requestWithAuth("Bearer correct-token-value-but-longer"))).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    process.env.ALEXA_API_TOKEN = "correct-token-value";
    expect(isAuthorizedAlexaRequest(requestWithAuth())).toBe(false);
  });

  it("rejects a non-Bearer Authorization header", () => {
    process.env.ALEXA_API_TOKEN = "correct-token-value";
    expect(isAuthorizedAlexaRequest(requestWithAuth("Basic correct-token-value"))).toBe(false);
  });

  it("rejects everything when ALEXA_API_TOKEN is not configured", () => {
    delete process.env.ALEXA_API_TOKEN;
    expect(isAuthorizedAlexaRequest(requestWithAuth("Bearer anything"))).toBe(false);
  });
});
