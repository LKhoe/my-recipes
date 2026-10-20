import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

// Browsing the collection is open to anyone: the root redirect, the list/search, a recipe and its
// cook mode. Everything else — adding/editing recipes, planning, shopping list, settings — needs
// a login. `/recipes/new` has the same shape as `/recipes/{id}`, so it's excluded by name.
const PUBLIC_RECIPE_PATH = /^\/(recipes(\/(?!new$)[^/]+(\/cook)?)?)?\/?$/;

export function isPublicPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => pathname.startsWith(path)) || PUBLIC_RECIPE_PATH.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cookie presence check only (fast, edge-safe) — real session validation happens
  // server-side wherever data is actually read/written (requireSession in lib/session.ts).
  // Signed-in users are bounced off the public auth pages by app/(auth)/layout.tsx instead of
  // here: a stale/forged cookie would otherwise loop /login → / → /recipes → /login.
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
