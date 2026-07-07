"use client";

import { useState } from "react";
import { Cat, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Tip } from "@/components/recipes/RecipeSteps";

/** The "pulo do gato" trigger — a cat icon next to a step that reveals/collects tips for it. */
export function StepTip({
  recipeId,
  stepIndex,
  currentUserId,
  tips,
  onTipsChange,
}: {
  recipeId: string;
  stepIndex: number;
  currentUserId: string;
  tips: Tip[];
  onTipsChange: (next: Tip[]) => void;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/recipes/${recipeId}/tips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, stepIndex }),
    });
    if (res.ok) {
      const created = await res.json();
      onTipsChange([
        ...tips,
        { id: created.id, body, stepIndex, userId: currentUserId, userName: null, createdAt: new Date().toISOString() },
      ]);
      setBody("");
    } else {
      const errBody = await res.json().catch(() => null);
      setError(errBody?.error ?? "Falha ao salvar a dica.");
    }
    setSaving(false);
  }

  async function handleDelete(tipId: string) {
    const res = await fetch(`/api/recipes/${recipeId}/tips/${tipId}`, { method: "DELETE" });
    if (res.ok) {
      onTipsChange(tips.filter((t) => t.id !== tipId));
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pulo do gato"
          title="Pulo do gato"
          className={cn(
            "relative shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            tips.length > 0 && "text-primary",
          )}
        >
          <Cat className="size-4" />
          {tips.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
              {tips.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex flex-col gap-3">
          {tips.length > 0 && (
            <ul className="flex flex-col gap-2">
              {tips.map((tip) => (
                <li key={tip.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="text-foreground">{tip.body}</p>
                    {tip.userName && <p className="mt-0.5 text-xs text-muted-foreground">— {tip.userName}</p>}
                  </div>
                  {tip.userId === currentUserId && (
                    <button
                      type="button"
                      onClick={() => handleDelete(tip.id)}
                      aria-label="Remover dica"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <Textarea
              placeholder="Compartilhe um truque para este passo"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-16 text-sm"
            />
            <Button type="button" size="sm" variant="outline" disabled={saving || !body.trim()} onClick={handleAdd}>
              {saving ? "Salvando…" : "Adicionar dica"}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
