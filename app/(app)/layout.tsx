import Link from "next/link";
import { getSession } from "@/lib/session";
import { UserMenu } from "@/components/auth/UserMenu";
import { Logo } from "@/components/Logo";
import { DesktopNav, MobileTabBar } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-6">
          <Link href="/recipes">
            <Logo />
          </Link>
          <DesktopNav />
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
      <MobileTabBar />
    </div>
  );
}
