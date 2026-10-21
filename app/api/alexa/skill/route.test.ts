import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/kitchen", () => ({
  getActiveKitchenRecipe: vi.fn().mockResolvedValue(null),
  sendToKitchen: vi.fn(),
  advanceKitchenStep: vi.fn(),
}));

const { POST } = await import("./route");

const SKILL_ID = "amzn1.ask.skill.test";

function launchBody(applicationId = SKILL_ID) {
  const system = { application: { applicationId }, user: { userId: "u" }, device: { deviceId: "d", supportedInterfaces: {} } };
  return JSON.stringify({
    version: "1.0",
    session: { new: true, sessionId: "s", application: system.application, user: system.user },
    context: { System: system },
    request: { type: "LaunchRequest", requestId: "r", timestamp: new Date().toISOString(), locale: "pt-BR" },
  });
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new NextRequest("http://localhost/api/alexa/skill", { method: "POST", body, headers }));
}

describe("POST /api/alexa/skill", () => {
  beforeEach(() => {
    vi.stubEnv("ALEXA_SKILL_ID", SKILL_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request without Amazon's signature", async () => {
    vi.stubEnv("ALEXA_SKIP_VERIFICATION", "");
    const res = await post(launchBody());
    expect(res.status).toBe(401);
  });

  it("rejects a forged signature", async () => {
    vi.stubEnv("ALEXA_SKIP_VERIFICATION", "");
    const res = await post(launchBody(), {
      SignatureCertChainUrl: "https://evil.example.com/echo.api/cert.pem",
      "Signature-256": "Zm9yZ2Vk",
    });
    expect(res.status).toBe(401);
  });

  it("never skips verification in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALEXA_SKIP_VERIFICATION", "1");
    const res = await post(launchBody());
    expect(res.status).toBe(401);
  });

  it("answers an unsigned request when verification is skipped locally", async () => {
    vi.stubEnv("ALEXA_SKIP_VERIFICATION", "1");
    const res = await post(launchBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.response.outputSpeech.ssml).toContain("Qual receita você quer preparar?");
  });

  it("refuses another skill's request", async () => {
    vi.stubEnv("ALEXA_SKIP_VERIFICATION", "1");
    const res = await post(launchBody("amzn1.ask.skill.other"));
    expect(res.status).toBe(400);
  });

  it("fails closed without a configured skill id", async () => {
    vi.stubEnv("ALEXA_SKILL_ID", "");
    vi.stubEnv("ALEXA_SKIP_VERIFICATION", "");
    const res = await post(launchBody());
    expect(res.status).toBe(500);
  });
});
