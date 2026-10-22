"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** The five tabs: a page outside them is a detail page and gets a back button. */
const ROOTS = ["/recipes", "/review", "/playlists", "/plan", "/shopping-list", "/settings"];

/**
 * Back button for phones, where an installed PWA has no browser chrome. Goes back in history when
 * this tab navigated inside the app; on a cold entry (push notification, shared link) there is
 * nothing to go back to, so it falls back to the recipe list instead of leaving the app.
 */
export function BackButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const firstPath = useRef(pathname);
  const navigated = useRef(false);

  useEffect(() => {
    if (pathname !== firstPath.current) navigated.current = true;
  }, [pathname]);

  if (ROOTS.includes(pathname)) return null;

  return (
    <button
      type="button"
      aria-label="Voltar"
      onClick={() => (navigated.current ? router.back() : router.replace("/recipes"))}
      className={cn(
        "-ml-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-secondary sm:hidden",
        className,
      )}
    >
      <ChevronLeft className="size-6" />
    </button>
  );
}
