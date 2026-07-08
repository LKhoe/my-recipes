"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Utensils, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function SendToKitchenButton({
  recipeId,
  servings,
  isActive,
}: {
  recipeId: string;
  servings: number | null;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [justSent, setJustSent] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/kitchen/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, servingsOverride: servings }),
    });
    setLoading(false);

    if (res.ok) {
      toast.success("Enviado para a cozinha");
      setJustSent(true);
      setTimeout(() => setJustSent(false), 1200);
      router.refresh();
    } else {
      toast.error("Não foi possível enviar para a cozinha");
    }
  }

  return (
    <Button type="button" variant={isActive ? "secondary" : "outline"} size="sm" disabled={loading} onClick={handleClick}>
      <span
        key={justSent ? "sent" : "idle"}
        className={cn("flex items-center gap-1.5 animate-in zoom-in-50 fade-in-0 duration-200")}
      >
        {justSent ? <Check className="size-4" /> : <Utensils className="size-4" />}
        {justSent ? "Enviado!" : isActive ? "Ativa na cozinha" : "Enviar para a cozinha"}
      </span>
    </Button>
  );
}
