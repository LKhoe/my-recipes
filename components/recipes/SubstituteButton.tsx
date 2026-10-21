"use client";

import { useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatIngredientLine } from "@/lib/format";
import type { SubstitutionResult } from "@/lib/services/substitution";

type State = { status: "idle" | "loading" } | { status: "done"; result: SubstitutionResult } | { status: "error"; message: string };

/**
 * "Não tenho" next to an ingredient: asks what to use instead (the recipe's own "or" option, or the
 * free LLM tier) and shows it scaled to the servings on screen. Fetched on first open only.
 */
export function SubstituteButton({
  recipeId,
  ingredientName,
  factor,
}: {
  recipeId: string;
  ingredientName: string;
  factor: number;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function load() {
    setState({ status: "loading" });
    const res = await fetch(`/api/recipes/${recipeId}/substitutions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientName }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok && body) {
      setState({ status: "done", result: body as SubstitutionResult });
    } else {
      setState({ status: "error", message: body?.error ?? "Não deu para buscar substitutos." });
    }
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && (state.status === "idle" || state.status === "error")) load();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Não tenho ${ingredientName}: o que usar no lugar?`}
          title="Não tenho: o que usar no lugar?"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftRight className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-left">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          No lugar de {ingredientName}
        </p>
        {state.status === "loading" && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Pensando no que dá para usar…
          </p>
        )}
        {state.status === "error" && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-destructive">{state.message}</p>
            <Button type="button" size="sm" variant="outline" onClick={load}>
              Tentar de novo
            </Button>
          </div>
        )}
        {state.status === "done" && (
          <div className="mt-3 flex flex-col gap-3">
            {state.result.source === "recipe" && (
              <p className="text-xs text-muted-foreground">A própria receita já dá a opção:</p>
            )}
            {state.result.suggestions.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {state.result.suggestions.map((s) => (
                  <li key={s.name} className="text-sm">
                    <p className="font-medium text-foreground">
                      {formatIngredientLine({ ingredientName: s.name, quantity: s.quantity, unit: s.unit, note: null }, factor)}
                    </p>
                    {s.note && <p className="mt-0.5 text-muted-foreground first-letter:uppercase">{s.note}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              !state.result.tip && <p className="text-sm text-muted-foreground">Não encontrei um bom substituto.</p>
            )}
            {state.result.tip && <p className="text-sm text-muted-foreground">{state.result.tip}</p>}
            {state.result.source === "ai" && (
              <p className="text-[11px] text-muted-foreground/80">Sugestão gerada por IA: confira antes de usar.</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
