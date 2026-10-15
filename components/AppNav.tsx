"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, Settings, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/recipes", label: "Receitas", shortLabel: "Receitas", icon: BookOpen },
  { href: "/plan", label: "Planejamento", shortLabel: "Plano", icon: CalendarDays },
  { href: "/shopping-list", label: "Lista de Compras", shortLabel: "Lista", icon: ShoppingCart },
  { href: "/settings", label: "Configurações", shortLabel: "Ajustes", icon: Settings },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Inline header links, from `sm` up. */
export function DesktopNav() {
  const isActive = useIsActive();

  return (
    <nav className="hidden items-center gap-1 text-sm sm:flex">
      {NAV_ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
            isActive(href) && "bg-secondary font-medium text-secondary-foreground hover:text-secondary-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Bottom tab bar below `sm` — the kitchen/phone is a primary context (SPEC §2a), and the header
 * links don't fit there. Cook mode and the photo lightbox are `fixed inset-0 z-50`, so they
 * cover it.
 */
export function MobileTabBar() {
  const isActive = useIsActive();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
      <ul className="grid grid-cols-4">
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
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="size-5" />
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
