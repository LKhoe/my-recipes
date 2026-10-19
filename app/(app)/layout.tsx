import Link from "next/link";
import { getSession } from "@/lib/session";
import { UserMenu } from "@/components/auth/UserMenu";
import { LoginButton } from "@/components/auth/LoginButton";
import { Logo } from "@/components/Logo";
import { DesktopNav, MobileTabBar } from "@/components/AppNav";
import { cn } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <div
      className={cn(
        "min-h-screen bg-background",
        isLoggedIn && "pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0",
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-6">
          <Link href="/recipes">
            <Logo />
          </Link>
          <DesktopNav isLoggedIn={isLoggedIn} />
        </div>
        {session?.user ? (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image ?? null}
          />
        ) : (
          <LoginButton />
        )}
      </header>
      {children}
      {isLoggedIn && <MobileTabBar />}
    </div>
  );
}
