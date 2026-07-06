"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UserMenu({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string;
  image: string | null;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = (name || email).slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-8">
        {image && <AvatarImage src={image} alt={name ?? email} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="hidden text-sm sm:block">
        <p className="font-medium leading-tight">{name || email}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        Sair
      </Button>
    </div>
  );
}
