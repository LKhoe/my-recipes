"use client";

import { useState } from "react";
import { Loader2, ListVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { notifyImportBatchesChanged } from "@/lib/import-batch-events";
import type { LLMTier } from "@/lib/llm-tiers";
import { cn } from "@/lib/utils";
import { cleanVideoTitle } from "@/lib/youtube-utils";

export type PickerVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  alreadyImported: boolean;
  queued: boolean;
};

export type PickerPlaylist = { playlistId: string; title: string; videos: PickerVideo[] };

/**
 * The videos of a playlist, to pick which become recipes. Videos already in the collection or
 * already queued start unchecked. Confirming queues them on the server, which imports them one by
 * one while the user does something else; the progress popup (ImportProgress) follows them.
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
    () => new Set(playlist.videos.filter((v) => !v.alreadyImported && !v.queued).map((v) => v.videoId)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selected.size === playlist.videos.length;

  function toggle(videoId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
  }

  async function queue() {
    setError(null);
    setSubmitting(true);
    try {
      const videos = playlist.videos
        .filter((v) => selected.has(v.videoId))
        .map(({ videoId, title, thumbnailUrl }) => ({ videoId, title, thumbnailUrl }));
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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <ListVideo className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-medium leading-snug text-foreground">
            {playlist.title || "Playlist do YouTube"}
          </p>
          <p className="text-xs text-muted-foreground">
            {playlist.videos.length} {playlist.videos.length === 1 ? "vídeo" : "vídeos"} · escolha quais viram receitas
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSelected(allSelected ? new Set() : new Set(playlist.videos.map((v) => v.videoId)))}
        >
          {allSelected ? "Desmarcar todos" : "Marcar todos"}
        </Button>
      </div>

      {playlist.videos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Esta playlist não tem vídeos disponíveis.</p>
      ) : (
        <ul className="-mx-1 flex max-h-[26rem] flex-col gap-1 overflow-y-auto px-1">
          {playlist.videos.map((video) => {
            const checked = selected.has(video.videoId);
            return (
              <li key={video.videoId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted",
                    checked && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(state) => toggle(video.videoId, state === true)}
                    aria-label={cleanVideoTitle(video.title)}
                  />
                  <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:w-28">
                    {video.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail, already sized by YouTube
                      <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-snug text-foreground">{cleanVideoTitle(video.title)}</p>
                    {(video.alreadyImported || video.queued) && (
                      <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                        {video.queued ? "já está na fila" : "já é uma receita"}
                      </span>
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
        <Button type="button" onClick={queue} disabled={submitting || selected.size === 0}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {selected.size === 1 ? "Importar 1 receita" : `Importar ${selected.size} receitas`}
        </Button>
      </div>
    </div>
  );
}
