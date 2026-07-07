"use client";

import { useState } from "react";
import type { RecipeStep } from "@/types";
import { StepTip } from "@/components/recipes/StepTip";

export type Tip = {
  id: string;
  body: string;
  stepIndex: number | null;
  userId: string;
  userName: string | null;
  createdAt: string;
};

export function RecipeSteps({
  recipeId,
  steps,
  currentUserId,
  initialTips,
}: {
  recipeId: string;
  steps: RecipeStep[];
  /** Absent when the viewer isn't logged in — tips are then read-only via the count badge. */
  currentUserId: string | null;
  initialTips: Tip[];
}) {
  const [tips, setTips] = useState(initialTips);

  function tipsForStep(index: number) {
    return tips.filter((t) => t.stepIndex === index);
  }

  return (
    <ol className="mt-3 flex flex-col gap-4">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {i + 1}
          </span>
          <div className="flex flex-1 items-start justify-between gap-2">
            <div>
              <p className="text-foreground">{step.text}</p>
              {step.durationMinutes && (
                <p className="mt-1 text-xs text-muted-foreground">{step.durationMinutes} min</p>
              )}
            </div>
            {currentUserId && (
              <StepTip
                recipeId={recipeId}
                stepIndex={i}
                currentUserId={currentUserId}
                tips={tipsForStep(i)}
                onTipsChange={(next) => setTips([...tips.filter((t) => t.stepIndex !== i), ...next])}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
