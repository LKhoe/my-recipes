"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ListVideo, Loader2 } from "lucide-react";
import { AlreadyImportedDialog, type ExistingRecipe } from "@/components/recipes/AlreadyImportedDialog";
import { PlaylistPicker, type PickerPlaylist } from "@/components/recipes/PlaylistPicker";
import { DEFAULT_LLM_TIER, LLM_TIER_LABELS, LLM_TIERS, type LLMTier } from "@/lib/llm-tiers";
import { cn } from "@/lib/utils";
import { isYouTubePlaylistPage, parseYouTubePlaylistId } from "@/lib/youtube-utils";
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
  const [playlist, setPlaylist] = useState<PickerPlaylist | null>(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [queuedCount, setQueuedCount] = useState<number | null>(null);
  const [duplicates, setDuplicates] = useState<ExistingRecipe[] | null>(null);

  // A video watched inside a playlist (watch?v=…&list=…) imports as that one video, with the
  // whole playlist one click away; a playlist page goes straight to the picker.
  const inPlaylist = parseYouTubePlaylistId(url) !== null;
  const isPlaylistPage = isYouTubePlaylistPage(url);

  const phase = [...IMPORT_PHASES].reverse().find((p) => elapsedSeconds >= p.atSeconds) ?? IMPORT_PHASES[0];

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  async function loadPlaylist() {
    setError(null);
    setLoadingPlaylist(true);
    try {
      const res = await fetch(`/api/youtube/playlist?url=${encodeURIComponent(url)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Não foi possível carregar a playlist.");
      setPlaylist(body as PickerPlaylist);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingPlaylist(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (isPlaylistPage) {
      await loadPlaylist();
      return;
    }
    setError(null);
    setLoading(true);
    setElapsedSeconds(0);

    // A link that already became a recipe asks first, before spending an import on it. If the
    // check itself fails, the import goes ahead.
    const existing = await fetch(`/api/recipes/by-source?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => (body?.recipes ?? []) as ExistingRecipe[])
      .catch(() => []);
    if (existing.length > 0) {
      setLoading(false);
      setDuplicates(existing);
      return;
    }
    await runImport();
  }

  async function runImport() {
    setDuplicates(null);
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

  if (queuedCount !== null) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <CheckCircle2 className="size-5 text-primary" />
          {queuedCount === 1 ? "1 vídeo na fila de importação" : `${queuedCount} vídeos na fila de importação`}
        </p>
        <p className="text-sm text-muted-foreground">
          As receitas são importadas uma a uma no servidor, então você pode sair desta página. Acompanhe o progresso
          pelo aviso no canto da tela; cada receita fica em “Para revisar” até você conferi-la.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setQueuedCount(null);
            setPlaylist(null);
            setUrl("");
          }}
        >
          Importar outro link
        </Button>
      </div>
    );
  }

  const busy = loading || loadingPlaylist;

  return (
    <form onSubmit={handleImport} className="flex flex-col gap-3">
      <Label htmlFor="import-url">Link da receita, de um vídeo ou de uma playlist do YouTube</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="import-url"
          type="url"
          required
          placeholder="https://exemplo.com/receita ou um link do YouTube"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPlaylist(null);
          }}
          disabled={busy}
        />
        <Button type="submit" disabled={busy} className="sm:w-40">
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {elapsedSeconds}s
            </>
          ) : loadingPlaylist && isPlaylistPage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isPlaylistPage ? (
            "Ver vídeos"
          ) : (
            "Importar"
          )}
        </Button>
      </div>
      {inPlaylist && !isPlaylistPage && !playlist && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ListVideo className="size-4" />
          Este vídeo faz parte de uma playlist.
          <Button type="button" variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={loadPlaylist}>
            {loadingPlaylist && <Loader2 className="size-3.5 animate-spin" />}
            Escolher vídeos da playlist
          </Button>
        </div>
      )}
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
              disabled={busy}
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
      <AlreadyImportedDialog
        open={duplicates !== null}
        recipes={duplicates ?? []}
        description={
          duplicates?.length === 1
            ? "Este link já foi importado e virou a receita abaixo. Importar de novo cria uma receita repetida."
            : "Este link já foi importado e virou as receitas abaixo. Importar de novo cria uma receita repetida."
        }
        confirmLabel="Importar mesmo assim"
        onConfirm={() => void runImport()}
        onCancel={() => setDuplicates(null)}
      />
      {playlist && (
        <PlaylistPicker
          playlist={playlist}
          tier={tier}
          onCancel={() => setPlaylist(null)}
          onQueued={(count) => setQueuedCount(count)}
        />
      )}
    </form>
  );
}
