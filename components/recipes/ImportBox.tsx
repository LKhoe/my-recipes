"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { DEFAULT_LLM_TIER, LLM_TIER_LABELS, LLM_TIERS, type LLMTier } from "@/lib/llm-tiers";
import { cn } from "@/lib/utils";
import type { RecipeDraft } from "@/types";

// Cross-faded status copy while an import is in flight — roughly matches the real pipeline
// (JSON-LD parse → LLM extraction fallback → image fetch), purely cosmetic so a ~30-60s import
// (per DECISIONS.md) doesn't feel like a frozen spinner.
const IMPORT_PHASES = [
  { atSeconds: 0, label: "Lendo a página…" },
  { atSeconds: 3, label: "Procurando os ingredientes…" },
  { atSeconds: 8, label: "Interpretando o modo de preparo…" },
  { atSeconds: 16, label: "Baixando a imagem…" },
  { atSeconds: 26, label: "Quase lá…" },
];

export function ImportBox({ onImported }: { onImported: (draft: RecipeDraft) => void }) {
  const [url, setUrl] = useState("");
  const [tier, setTier] = useState<LLMTier>(DEFAULT_LLM_TIER);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const phase = [...IMPORT_PHASES].reverse().find((p) => elapsedSeconds >= p.atSeconds) ?? IMPORT_PHASES[0];

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setElapsedSeconds(0);

    try {
      const res = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, tier }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha na importação.");
      onImported(body as RecipeDraft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleImport} className="flex flex-col gap-3">
      <Label htmlFor="import-url">Link da receita ou do YouTube</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="import-url"
          type="url"
          required
          placeholder="https://exemplo.com/receita ou um link do YouTube"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" disabled={loading} className="sm:w-40">
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {elapsedSeconds}s
            </>
          ) : (
            "Importar"
          )}
        </Button>
      </div>
      {/* Only used when the page has no structured recipe data and the AI has to read it */}
      <div className="flex flex-col gap-1.5">
        <span id="import-tier-label" className="text-xs text-muted-foreground">
          IA para ler a página, quando ela não traz a receita estruturada
        </span>
        <div role="radiogroup" aria-labelledby="import-tier-label" className="flex flex-wrap gap-2">
          {LLM_TIERS.map((t) => (
            <Button
              key={t}
              type="button"
              role="radio"
              aria-checked={tier === t}
              size="sm"
              variant={tier === t ? "default" : "outline"}
              disabled={loading}
              onClick={() => setTier(t)}
            >
              {LLM_TIER_LABELS[t].label}
              <span className={cn("text-xs", tier === t ? "opacity-80" : "text-muted-foreground")}>
                {LLM_TIER_LABELS[t].hint}
              </span>
            </Button>
          ))}
        </div>
      </div>
      {loading && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate-bar" />
          </div>
          <p key={phase.label} className="text-xs text-muted-foreground animate-in fade-in-0 duration-500">
            {phase.label}
          </p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
