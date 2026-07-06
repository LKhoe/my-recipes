import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { UserMenu } from "@/components/auth/UserMenu";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="font-display text-display-sm text-foreground">My Recipes</h1>
        {session?.user && (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image ?? null}
          />
        )}
      </header>
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h2 className="font-display text-display-lg text-foreground">
          Welcome, {session?.user?.name || session?.user?.email}.
        </h2>
        <p className="mt-3 text-muted-foreground">
          The recipe box is empty for now — importing and manual entry land in Phase 1.
        </p>
      </main>
    </div>
  );
}
