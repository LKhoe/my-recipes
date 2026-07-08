"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({ recipeId, initialScore }: { recipeId: string; initialScore: number | null }) {
  const [score, setScore] = useState(initialScore);
  const [hovered, setHovered] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Bumped only when `score` actually changes (a real click), not on hover — the star icons key
  // off this to replay their staggered pop-in, and stay untouched while just hover-previewing.
  const [scoreChangeCount, setScoreChangeCount] = useState(0);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setScoreChangeCount((c) => c + 1);
  }, [score]);

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
            key={`${value}-${scoreChangeCount}`}
            className={cn(
              "size-5 transition-colors",
              value <= displayed
                ? "fill-primary text-primary animate-in zoom-in-50 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                : "fill-none text-muted-foreground",
            )}
            style={value <= displayed ? { animationDelay: `${(value - 1) * 60}ms` } : undefined}
          />
        </button>
      ))}
    </div>
  );
}
