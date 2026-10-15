import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // Cookie presence check only (fast, edge-safe) — real session validation happens
  // server-side wherever data is actually read/written (requireSession in lib/session.ts).
  // Signed-in users are bounced off the public auth pages by app/(auth)/layout.tsx instead of
  // here: a stale/forged cookie would otherwise loop /login → / → /recipes → /login.
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
