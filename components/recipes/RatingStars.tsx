"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({ recipeId, initialScore }: { recipeId: string; initialScore: number | null }) {
  const [score, setScore] = useState(initialScore);
  const [hovered, setHovered] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleClick(value: number) {
    const next = score === value ? null : value; // clicking the current rating clears it
    setScore(next);
    setSaving(true);
    await fetch(`/api/recipes/${recipeId}/rating`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: next }),
    }).catch(() => {});
    setSaving(false);
  }

  const displayed = hovered ?? score ?? 0;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          disabled={saving}
          onMouseEnter={() => setHovered(value)}
          onClick={() => handleClick(value)}
          aria-label={`Avaliar com ${value} estrela${value > 1 ? "s" : ""}`}
          className="p-0.5"
        >
          <Star
            className={cn(
              "size-5 transition-colors",
              value <= displayed ? "fill-primary text-primary" : "fill-none text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}
