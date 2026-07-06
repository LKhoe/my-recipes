import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isInviteCodeRedeemable, PENDING_INVITE_COOKIE, PENDING_INVITE_COOKIE_MAX_AGE_SECONDS } from "@/lib/invite";

// Called before either sign-up path (email/password submit, or "Continue with Google" click)
// so the invite code survives as a cookie through the OAuth redirect round trip. The
// databaseHooks.user.create hook in lib/auth.ts is the authoritative check; this endpoint is
// the UX-facing pre-validation.
export async function POST(request: NextRequest) {
  const { code } = await request.json().catch(() => ({ code: undefined }));

  if (typeof code !== "string" || !(await isInviteCodeRedeemable(code))) {
    return NextResponse.json({ error: "Invalid or already-used invite code." }, { status: 400 });
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
