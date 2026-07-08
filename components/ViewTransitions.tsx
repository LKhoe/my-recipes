"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

/**
 * Drives the browser's native View Transitions API across Next.js App Router client-side
 * navigations, without the `experimental.viewTransition` flag (which needs React's experimental
 * channel — not something to pull into this app just for this). `document.startViewTransition`'s
 * callback can return a promise it awaits before snapshotting the new DOM state; this resolves
 * that promise on the next `pathname` change (i.e. once the new route has committed), which is
 * the trick that makes it work with App Router's async, RSC-driven navigation.
 */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
};

const NavigateContext = createContext<(href: string) => void>(() => {});

export function ViewTransitionsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    resolveRef.current?.();
    resolveRef.current = null;
  }, [pathname]);

  const navigate = useCallback(
    (href: string) => {
      const doc = document as DocumentWithViewTransition;
      if (!doc.startViewTransition) {
        router.push(href);
        return;
      }
      doc.startViewTransition(() => {
        return new Promise<void>((resolve) => {
          resolveRef.current = resolve;
          startTransition(() => router.push(href));
        });
      });
    },
    [router],
  );

  return <NavigateContext.Provider value={navigate}>{children}</NavigateContext.Provider>;
}

export function useViewTransitionNavigate() {
  return useContext(NavigateContext);
}

/** Drop-in replacement for `next/link` that morphs matching `view-transition-name` elements. */
export function TransitionLink({ href, onClick, ...props }: React.ComponentProps<typeof Link>) {
  const navigate = useViewTransitionNavigate();

  return (
    <Link
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(typeof href === "string" ? href : href.toString());
      }}
      {...props}
    />
  );
}
