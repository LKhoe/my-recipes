import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { UserMenu } from "@/components/auth/UserMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/recipes" className="font-display text-display-sm text-foreground">
            My Recipes
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            <Link href="/recipes" className="hover:text-foreground">
              Recipes
            </Link>
            <Link href="/plan" className="hover:text-foreground">
              Plan
            </Link>
            <Link href="/shopping-list" className="hover:text-foreground">
              Shopping List
            </Link>
            <Link href="/settings" className="hover:text-foreground">
              Settings
            </Link>
          </nav>
        </div>
        {session?.user && (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image ?? null}
          />
        )}
      </header>
      {children}
    </div>
  );
}
