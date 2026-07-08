"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Play, Pause, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIngredientLine } from "@/lib/format";
import { useIngredientScaling } from "@/hooks/use-ingredient-scaling";
import { ScaleControls } from "@/components/recipes/ScaleControls";
import type { RecipeIngredientInput, RecipeStep } from "@/types";

type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

function StepTimer({ stepIndex, durationMinutes }: { stepIndex: number; durationMinutes: number }) {
  const [remaining, setRemaining] = useState(durationMinutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, stepIndex]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const done = remaining === 0;
  const total = durationMinutes * 60;

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? remaining / total : 0;
  const dashoffset = circumference * (1 - progress);

  return (
    <div
      className={cn(
        "mt-4 flex flex-col items-center gap-3 rounded-xl border px-6 py-4",
        done ? "border-primary bg-primary/10" : "border-border bg-muted/50",
      )}
    >
      <div className={cn("relative flex size-24 items-center justify-center rounded-full", done && "animate-pulse-glow")}>
        <svg viewBox="0 0 72 72" className="absolute inset-0 size-full -rotate-90">
          <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="5" className="stroke-border" />
          <circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <span className={cn("font-display text-xl tabular-nums", done && "text-primary")}>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {done ? (
          <span className="text-sm font-medium text-primary">Tempo esgotado!</span>
        ) : (
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {running ? "Pausar" : "Iniciar timer"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setRemaining(total);
            setRunning(false);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Reiniciar timer"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function CookModeClient({
  recipeId,
  title,
  originalServings,
  ingredients,
  steps,
  isActiveInKitchen,
  initialStepIndex,
}: {
  recipeId: string;
  title: string;
  originalServings: number | null;
  ingredients: RecipeIngredientInput[];
  steps: RecipeStep[];
  isActiveInKitchen: boolean;
  initialStepIndex: number;
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(
    Math.min(initialStepIndex, Math.max(steps.length - 1, 0)),
  );
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const { factor, servings, setFactor, adjustServings } = useIngredientScaling(originalServings);
  const isFirstRender = useRef(true);

  // Screen Wake Lock API — keeps the display on for the duration of cooking. Released on unmount,
  // re-acquired on visibilitychange since the browser auto-releases it on tab switch.
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;

    async function acquire() {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock) return;
      try {
        sentinel = await nav.wakeLock.request("screen");
      } catch {
        // Wake lock can be refused (e.g. low battery) — cook mode still works, just without it.
      }
    }

    acquire();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinel) acquire();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, []);

  // SPEC §4.1a: sync progress to KitchenState only while this recipe is still the active one.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isActiveInKitchen) return;
    fetch("/api/kitchen/step", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, currentStepIndex }),
    }).catch(() => {});
  }, [currentStepIndex, isActiveInKitchen, recipeId]);

  const step = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  function goNext() {
    setCheckedSteps((prev) => new Set(prev).add(currentStepIndex));
    if (!isLastStep) {
      setDirection("forward");
      setCurrentStepIndex((i) => i + 1);
    }
  }

  function goBack() {
    if (currentStepIndex > 0) {
      setDirection("back");
      setCurrentStepIndex((i) => i - 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link href={`/recipes/${recipeId}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
          <X className="size-5" />
        </Link>
        <h1 className="line-clamp-1 font-display text-base text-foreground">{title}</h1>
        <span className="w-5" />
      </header>

      <div className="h-1.5 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentStepIndex + 1) / Math.max(steps.length, 1)) * 100}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setIngredientsOpen((o) => !o)}
        className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-medium text-foreground"
      >
        Ingredientes{servings ? ` (${servings} porções)` : ""}
        {ingredientsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {ingredientsOpen && (
        <div className="max-h-64 overflow-y-auto border-b border-border bg-muted/30 px-4 py-3">
          <div className="mb-2">
            <ScaleControls servings={servings} factor={factor} onAdjustServings={adjustServings} onSetFactor={setFactor} />
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {ingredients.map((item, i) => (
              <li key={`${i}-${factor}`} className="animate-number-roll">
                {formatIngredientLine(item, factor)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
        {/* Keyed to the step index (not the whole <main>) so StepTimer below — which owns its own
            countdown state per SPEC — never remounts and loses a running timer on navigation. */}
        <div
          key={currentStepIndex}
          className={cn(
            "flex flex-col items-center animate-in fade-in-0 duration-300",
            direction === "forward" ? "slide-in-from-right-8" : "slide-in-from-left-8",
          )}
        >
          <p className="text-sm font-medium text-muted-foreground">
            Etapa {currentStepIndex + 1} de {steps.length}
          </p>
          <p className="mt-4 max-w-2xl font-display text-display-lg leading-snug text-foreground">{step?.text}</p>
        </div>

        {step?.durationMinutes && <StepTimer stepIndex={currentStepIndex} durationMinutes={step.durationMinutes} />}

        <button
          type="button"
          onClick={() =>
            setCheckedSteps((prev) => {
              const next = new Set(prev);
              if (next.has(currentStepIndex)) next.delete(currentStepIndex);
              else next.add(currentStepIndex);
              return next;
            })
          }
          className={cn(
            "mt-6 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
            checkedSteps.has(currentStepIndex)
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground",
          )}
        >
          <Check className="size-4" /> {checkedSteps.has(currentStepIndex) ? "Feito" : "Marcar como feito"}
        </button>
      </main>

      <footer className="flex items-center gap-3 border-t border-border p-4">
        <button
          type="button"
          onClick={goBack}
          disabled={currentStepIndex === 0}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-border py-4 text-base font-medium text-foreground disabled:opacity-40"
        >
          <ChevronLeft className="size-5" /> Voltar
        </button>
        {isLastStep ? (
          <Link
            href={`/recipes/${recipeId}`}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary py-4 text-base font-medium text-primary-foreground"
          >
            Concluir
          </Link>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary py-4 text-base font-medium text-primary-foreground"
          >
            Próxima <ChevronRight className="size-5" />
          </button>
        )}
      </footer>
    </div>
  );
}
