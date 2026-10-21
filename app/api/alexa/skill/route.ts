import { NextRequest, NextResponse } from "next/server";
import type { RequestEnvelope } from "ask-sdk-model";
import { buildSkill } from "@/lib/alexa/skill";
import { verificationDisabled, verifyAlexaRequest } from "@/lib/alexa/verify";

// The Alexa skill's HTTPS endpoint (skill-package/skill.json). Authenticity comes from Amazon's
// request signature; the skill id check (withSkillId) then refuses any other skill's requests.
let skill: ReturnType<typeof buildSkill> | null = null;

export async function POST(request: NextRequest) {
  const skillId = process.env.ALEXA_SKILL_ID;
  if (!skillId && !verificationDisabled()) {
    console.error("[alexa] ALEXA_SKILL_ID is not set");
    return NextResponse.json({ error: "Skill não configurada" }, { status: 500 });
  }

  const body = await request.text();
  try {
    await verifyAlexaRequest(body, request.headers);
  } catch (err) {
    console.warn("[alexa] rejected request:", (err as Error).message);
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let envelope: RequestEnvelope;
  try {
    envelope = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  skill ??= buildSkill(skillId);
  try {
    return NextResponse.json(await skill.invoke(envelope));
  } catch (err) {
    // A request for another skill id, or one no handler can take.
    console.warn("[alexa] skill refused request:", (err as Error).message);
    return NextResponse.json({ error: "Requisição recusada" }, { status: 400 });
  }
}
