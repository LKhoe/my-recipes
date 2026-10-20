"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TierPicker } from "@/components/recipes/TierPicker";
import { notifyImportBatchesChanged } from "@/lib/import-batch-events";
import { DEFAULT_LLM_TIER, type LLMTier } from "@/lib/llm-tiers";

/**
 * "Buscar modo de preparo": queues the videos of recipes saved without a method, to read them
 * again and fill it in. Goes through the import queue (paced, paused while YouTube blocks the
 * captions), so the progress shows in the popup. Each recipe is one LLM call.
 */
export function RefillStepsControl({ recipeIds, label }: { recipeIds: string[]; label: string }) {
  const [tier, setTier] = useState<LLMTier>(DEFAULT_LLM_TIER);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);

  async function queue() {
    setSending(true);
    const res = await fetch("/api/recipes/refill-steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeIds, tier }),
    });
    const body = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) {
      toast.error(body?.error ?? "Não foi possível buscar o modo de preparo.");
      return;
    }
    setQueued(true);
    notifyImportBatchesChanged();
    toast.success(
      body.queued === 1
        ? "Na fila: o modo de preparo aparece aqui quando o vídeo for lido."
        : `${body.queued} receitas na fila. Acompanhe pelo aviso no canto da tela.`,
    );
  }

  if (queued) {
    return <p className="text-sm text-muted-foreground">Na fila. Acompanhe pelo aviso no canto da tela.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <TierPicker label="IA para ler o vídeo" value={tier} onChange={setTier} disabled={sending} />
      <Button type="button" size="sm" className="self-start" disabled={sending} onClick={queue}>
        {sending ? <Loader2 className="size-4 animate-spin" /> : <ListOrdered className="size-4" />}
        {label}
      </Button>
    </div>
  );
}
