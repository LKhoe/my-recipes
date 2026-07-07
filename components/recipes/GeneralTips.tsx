"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Tip } from "@/components/recipes/RecipeSteps";

/** Circle-shared tips not tied to any specific step (stepIndex null) — the general-purpose "pulo do gato" list. */
export function GeneralTips({
  recipeId,
  currentUserId,
  initialTips,
}: {
  recipeId: string;
  currentUserId: string;
  initialTips: Tip[];
}) {
  const [tips, setTips] = useState(initialTips);
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
      body: JSON.stringify({ body, stepIndex: null }),
    });
    if (res.ok) {
      const created = await res.json();
      setTips([
        ...tips,
        { id: created.id, body, stepIndex: null, userId: currentUserId, userName: null, createdAt: new Date().toISOString() },
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
      setTips(tips.filter((t) => t.id !== tipId));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {tips.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tips.map((tip) => (
            <li key={tip.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
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
          placeholder="Um truque geral para esta receita"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-16"
        />
        <div className="flex items-center gap-3 self-end">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button type="button" size="sm" variant="outline" disabled={saving || !body.trim()} onClick={handleAdd}>
            {saving ? "Salvando…" : "Adicionar dica"}
          </Button>
        </div>
      </div>
    </div>
  );
}
