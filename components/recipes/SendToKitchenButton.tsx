"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Utensils } from "lucide-react";

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

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/kitchen/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, servingsOverride: servings }),
    });
    setLoading(false);

    if (res.ok) {
      toast.success("Sent to kitchen");
      router.refresh();
    } else {
      toast.error("Could not send to kitchen");
    }
  }

  return (
    <Button type="button" variant={isActive ? "secondary" : "outline"} size="sm" disabled={loading} onClick={handleClick}>
      <Utensils className="size-4" /> {isActive ? "Active in kitchen" : "Send to kitchen"}
    </Button>
  );
}
