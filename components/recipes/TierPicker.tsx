"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { LLM_TIER_LABELS, LLM_TIERS, type LLMTier } from "@/lib/llm-tiers";
import { cn } from "@/lib/utils";

/** Which tier of LocalInfra's LLM gateway reads the page or video (lib/llm-tiers.ts). */
export function TierPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: LLMTier;
  onChange: (tier: LLMTier) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-xs text-muted-foreground">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {LLM_TIERS.map((t) => (
          <Button
            key={t}
            type="button"
            role="radio"
            aria-checked={value === t}
            size="sm"
            variant={value === t ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onChange(t)}
          >
            {LLM_TIER_LABELS[t].label}
            <span className={cn("text-xs", value === t ? "opacity-80" : "text-muted-foreground")}>
              {LLM_TIER_LABELS[t].hint}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
