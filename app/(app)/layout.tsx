import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { UserMenu } from "@/components/auth/UserMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/recipes" className="font-display text-display-sm text-foreground">
          My Recipes
        </Link>
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
