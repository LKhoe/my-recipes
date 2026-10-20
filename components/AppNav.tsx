"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, Settings, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/recipes", label: "Receitas", shortLabel: "Receitas", icon: BookOpen, public: true },
  { href: "/review", label: "Para revisar", shortLabel: "Revisar", icon: ClipboardCheck, public: false },
  { href: "/plan", label: "Planejamento", shortLabel: "Plano", icon: CalendarDays, public: false },
  { href: "/shopping-list", label: "Lista de Compras", shortLabel: "Lista", icon: ShoppingCart, public: false },
  { href: "/settings", label: "Configurações", shortLabel: "Ajustes", icon: Settings, public: false },
];

const REVIEW_HREF = "/review";

/** The number of the user's imported recipes waiting for review, on the "Para revisar" link. */
function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} pendentes`}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Inline header links, from `sm` up. Visitors only get the recipes — the rest needs a login. */
export function DesktopNav({ isLoggedIn, pendingReviewCount = 0 }: { isLoggedIn: boolean; pendingReviewCount?: number }) {
  const isActive = useIsActive();
  const items = NAV_ITEMS.filter((item) => isLoggedIn || item.public);

  return (
    <nav className="hidden items-center gap-1 text-sm sm:flex">
      {items.map(({ href, label, shortLabel }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
            isActive(href) && "bg-secondary font-medium text-secondary-foreground hover:text-secondary-foreground",
          )}
        >
          {/* Five links don't fit a tablet-width header with the full labels. */}
          <span className="lg:hidden">{shortLabel}</span>
          <span className="hidden lg:inline">{label}</span>
          {href === REVIEW_HREF && <CountBadge count={pendingReviewCount} />}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Bottom tab bar below `sm` — the kitchen/phone is a primary context (SPEC §2a), and the header
 * links don't fit there. Cook mode and the photo lightbox are `fixed inset-0 z-50`, so they
 * cover it. Members only: a visitor would have a single tab, so the layout leaves it out.
 */
export function MobileTabBar({ pendingReviewCount = 0 }: { pendingReviewCount?: number }) {
  const isActive = useIsActive();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ href, shortLabel, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors",
                  active && "font-medium text-primary",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="size-5" />
                  {href === REVIEW_HREF && <CountBadge count={pendingReviewCount} className="absolute -top-1 right-1" />}
                </span>
                {shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
