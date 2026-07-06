"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";

export function GenerateShoppingListButton({ recipeIds }: { recipeIds: string[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (recipeIds.length === 0) {
      toast.error("Atribua uma receita a esta semana primeiro.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/shopping-list/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeIds }),
    });
    setLoading(false);

    if (res.ok) {
      router.push("/shopping-list");
    } else {
      toast.error("Não foi possível gerar a lista de compras");
    }
  }

  return (
    <Button size="sm" disabled={loading} onClick={handleClick}>
      <ShoppingCart className="size-4" /> {loading ? "Gerando…" : "Lista de compras"}
    </Button>
  );
}
