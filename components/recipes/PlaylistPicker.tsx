"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, ExternalLink, Loader2, ListVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlreadyImportedDialog, type ExistingRecipe } from "@/components/recipes/AlreadyImportedDialog";
import { notifyImportBatchesChanged } from "@/lib/import-batch-events";
import type { LLMTier } from "@/lib/llm-tiers";
import { cn } from "@/lib/utils";
import { cleanVideoTitle } from "@/lib/youtube-utils";

export type PickerVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  /** The newest recipe already made from this video, by any member. */
  existingRecipe: ExistingRecipe | null;
  queued: boolean;
};

export type PickerPlaylist = { playlistId: string; title: string; videos: PickerVideo[] };

const isNew = (v: PickerVideo) => !v.existingRecipe && !v.queued;

/**
 * The videos of a playlist, to pick which become recipes. Videos already imported (with a link to
 * the recipe) or already queued are marked and start unchecked; picking one anyway asks first.
 * Confirming queues them on the server, which imports them one by one while the user does
 * something else; the progress popup (ImportProgress) follows them.
 */
export function PlaylistPicker({
  playlist,
  tier,
  onCancel,
  onQueued,
}: {
  playlist: PickerPlaylist;
  tier: LLMTier;
  onCancel: () => void;
  onQueued: (count: number) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(playlist.videos.filter(isNew).map((v) => v.videoId)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newVideos = playlist.videos.filter(isNew);
  const importedCount = playlist.videos.filter((v) => v.existingRecipe).length;
  const allNewSelected = newVideos.length > 0 && newVideos.every((v) => selected.has(v.videoId));
  const chosen = playlist.videos.filter((v) => selected.has(v.videoId));
  const chosenImported = chosen.flatMap((v) => (v.existingRecipe ? [v.existingRecipe] : []));

  function toggle(videoId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
  }

  async function queue() {
    setConfirming(false);
    setError(null);
    setSubmitting(true);
    try {
      const videos = chosen.map(({ videoId, title, thumbnailUrl }) => ({ videoId, title, thumbnailUrl }));
      const res = await fetch("/api/import-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: playlist.title || null, tier, videos }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Não foi possível iniciar a importação.");
      }
      notifyImportBatchesChanged();
      onQueued(videos.length);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const summary = [
    `${playlist.videos.length} ${playlist.videos.length === 1 ? "vídeo" : "vídeos"}`,
    importedCount > 0 && `${importedCount} já ${importedCount === 1 ? "importado" : "importados"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <ListVideo className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-medium leading-snug text-foreground">
            {playlist.title || "Playlist do YouTube"}
          </p>
          <p className="text-xs text-muted-foreground">{summary} · escolha quais viram receitas</p>
        </div>
        {newVideos.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(allNewSelected ? new Set() : new Set(newVideos.map((v) => v.videoId)))}
          >
            {allNewSelected ? "Desmarcar todos" : importedCount > 0 ? "Marcar os novos" : "Marcar todos"}
          </Button>
        )}
      </div>

      {playlist.videos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Esta playlist não tem vídeos disponíveis.</p>
      ) : (
        <ul className="-mx-1 flex max-h-[26rem] flex-col gap-1 overflow-y-auto px-1">
          {playlist.videos.map((video) => {
            const checked = selected.has(video.videoId);
            const title = cleanVideoTitle(video.title);
            return (
              <li key={video.videoId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted",
                    checked && "bg-primary/5",
                    !checked && !isNew(video) && "opacity-75",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(state) => toggle(video.videoId, state === true)}
                    aria-label={title}
                  />
                  <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:w-28">
                    {video.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail, already sized by YouTube
                      <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                    {video.existingRecipe && (
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-primary/90 py-0.5 text-[10px] font-medium text-primary-foreground">
                        <CheckCircle2 className="size-3" /> Importada
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-snug text-foreground">{title}</p>
                    {video.existingRecipe ? (
                      <Link
                        href={`/recipes/${video.existingRecipe.id}`}
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <span className="truncate">Já é a receita “{video.existingRecipe.title}”</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </Link>
                    ) : (
                      video.queued && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" /> Já está na fila de importação
                        </span>
                      )
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() => (chosenImported.length > 0 ? setConfirming(true) : void queue())}
          disabled={submitting || selected.size === 0}
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {selected.size === 1 ? "Importar 1 receita" : `Importar ${selected.size} receitas`}
        </Button>
      </div>

      <AlreadyImportedDialog
        open={confirming}
        recipes={chosenImported}
        description={
          chosenImported.length === 1
            ? "Um dos vídeos escolhidos já virou esta receita. Importar de novo cria uma receita repetida."
            : `${chosenImported.length} dos vídeos escolhidos já viraram estas receitas. Importar de novo cria receitas repetidas.`
        }
        confirmLabel="Importar mesmo assim"
        onConfirm={() => void queue()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
