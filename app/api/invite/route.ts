import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isInviteCodeRedeemable, PENDING_INVITE_COOKIE, PENDING_INVITE_COOKIE_MAX_AGE_SECONDS } from "@/lib/invite";

// Called before the "Continue with Google" redirect on the sign-up page so the invite code
// survives as a cookie through the OAuth round trip. SameSite=Lax is required: Google's callback
// is a cross-site top-level GET, which a Strict cookie would not accompany. The
// databaseHooks.user.create hook in lib/auth.ts is the authoritative check; this endpoint is
// the UX-facing pre-validation.
export async function POST(request: NextRequest) {
  const { code } = await request.json().catch(() => ({ code: undefined }));

  if (typeof code !== "string" || !(await isInviteCodeRedeemable(code))) {
    return NextResponse.json({ error: "Código de convite inválido ou já utilizado." }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(PENDING_INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PENDING_INVITE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
