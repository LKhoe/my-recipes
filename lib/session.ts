import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Validates the session cookie against the database. Memoized per request so the layout and
// page can both ask without a second lookup.
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

// proxy.ts only checks that a session cookie *exists*, so any value gets past it. Every page that
// reads data must call this first — layouts aren't re-rendered on every client navigation, so a
// check there alone doesn't cover each page's RSC request.
export async function requireSession(path: string) {
  const session = await getSession();
  if (!session?.user) {
    redirect(`/login?redirect=${encodeURIComponent(path)}`);
  }
  return session;
}
