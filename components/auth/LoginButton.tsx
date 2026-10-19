"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Header action for visitors: log in and come back to the page they were reading. */
export function LoginButton() {
  const pathname = usePathname();

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/login?redirect=${encodeURIComponent(pathname)}`}>
        <LogIn className="size-4" /> Entrar
      </Link>
    </Button>
  );
}
