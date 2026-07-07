"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUICK_SCALE_FACTORS } from "@/hooks/use-ingredient-scaling";

function formatFactorLabel(factor: number): string {
  return `${factor.toLocaleString("pt-BR")}x`;
}

export function ScaleControls({
  servings,
  factor,
  onAdjustServings,
  onSetFactor,
}: {
  /** Null when the recipe has no known servings count — the servings +/- stepper is hidden. */
  servings: number | null;
  factor: number;
  onAdjustServings: (delta: number) => void;
  onSetFactor: (factor: number) => void;
}) {
  const [customValue, setCustomValue] = useState("");

  function applyCustom() {
    const parsed = Number(customValue.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) onSetFactor(parsed);
    setCustomValue("");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {servings !== null && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAdjustServings(-1)}
            className="flex size-7 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
            aria-label="Menos porções"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-16 text-center text-sm text-muted-foreground">{servings} porções</span>
          <button
            type="button"
            onClick={() => onAdjustServings(1)}
            className="flex size-7 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
            aria-label="Mais porções"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1">
        {QUICK_SCALE_FACTORS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onSetFactor(f)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              factor === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {formatFactorLabel(f)}
          </button>
        ))}
        <input
          type="text"
          inputMode="decimal"
          placeholder="Outro"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onBlur={applyCustom}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyCustom();
            }
          }}
          className="h-[26px] w-14 rounded-full border border-border bg-transparent px-2 text-center text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          aria-label="Fator de multiplicação personalizado"
        />
      </div>
    </div>
  );
}
