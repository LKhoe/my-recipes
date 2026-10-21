"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  ListOrdered,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TierPicker } from "@/components/recipes/TierPicker";
import { notifyImportBatchesChanged } from "@/lib/import-batch-events";
import { DEFAULT_LLM_TIER, type LLMTier } from "@/lib/llm-tiers";
import type { PlaylistVideoStatus, SavedPlaylist, SavedPlaylistVideo } from "@/lib/services/playlist";
import { cn } from "@/lib/utils";
import { cleanVideoTitle, youTubeWatchUrl } from "@/lib/youtube-utils";

// While something of this playlist is in the queue, re-read the page now and then so imported and
// failed videos move to their group (the progress popup only refreshes on a new recipe).
const QUEUED_REFRESH_MS = 15_000;

type Group = { key: string; title: string; statuses: PlaylistVideoStatus[]; empty: string };

// The order the user asked for: not imported yet, imported, failed, ignored.
const GROUPS: Group[] = [
  { key: "pending", title: "Ainda não importados", statuses: ["new", "queued"], empty: "Nada para importar." },
  { key: "imported", title: "Já importados", statuses: ["imported"], empty: "Nenhum vídeo virou receita ainda." },
  { key: "failed", title: "Falha ao importar", statuses: ["failed"], empty: "" },
  { key: "ignored", title: "Ignorados", statuses: ["ignored"], empty: "" },
];

/** Videos that can be (re)imported: new ones, and failed ones to try again. */
const isSelectable = (v: SavedPlaylistVideo) => v.status === "new" || v.status === "failed";

/**
 * A saved playlist's videos by status, to import some (through the same queue as the playlist
 * picker, so the progress popup follows them), mark some "Ignorar", or read the playlist again for
 * new videos ("Atualizar").
 */
export function PlaylistManager({ playlist, refreshedAgo }: { playlist: SavedPlaylist; refreshedAgo: string }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<LLMTier>(DEFAULT_LLM_TIER);
  const [fetching, setFetching] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectable = playlist.videos.filter(isSelectable);
  // A video that left the selectable ones (queued, ignored, gone) drops out of the selection.
  const chosen = selectable.filter((v) => selected.has(v.videoId));
  const newVideos = playlist.videos.filter((v) => v.status === "new");
  const hasQueued = playlist.videos.some((v) => v.status === "queued");

  useEffect(() => {
    if (!hasQueued) return;
    const interval = setInterval(() => router.refresh(), QUEUED_REFRESH_MS);
    return () => clearInterval(interval);
  }, [hasQueued, router]);

  function toggle(videoId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
  }

  async function refreshFromYouTube() {
    setFetching(true);
    const res = await fetch(`/api/playlists/${playlist.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    const body = await res.json().catch(() => null);
    setFetching(false);
    if (!res.ok) {
      toast.error(body?.error ?? "Não foi possível atualizar a playlist.");
      return;
    }
    toast.success(
      body.added === 0
        ? "Nenhum vídeo novo na playlist."
        : body.added === 1
          ? "1 vídeo novo na playlist."
          : `${body.added} vídeos novos na playlist.`,
    );
    startRefresh(() => router.refresh());
  }

  async function setIgnored(video: SavedPlaylistVideo, ignored: boolean) {
    setTogglingId(video.videoId);
    const res = await fetch(`/api/playlists/${playlist.id}/videos/${encodeURIComponent(video.videoId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ignored }),
    });
    if (!res.ok) {
      setTogglingId(null);
      toast.error("Não foi possível salvar.");
      return;
    }
    toggle(video.videoId, false);
    startRefresh(() => {
      router.refresh();
      setTogglingId(null);
    });
  }

  async function importChosen() {
    setQueueing(true);
    const videos = chosen.map(({ videoId, title, thumbnailUrl }) => ({ videoId, title, thumbnailUrl }));
    const res = await fetch("/api/import-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: playlist.title, tier, videos }),
    });
    const body = await res.json().catch(() => null);
    setQueueing(false);
    if (!res.ok) {
      toast.error(body?.error ?? "Não foi possível iniciar a importação.");
      return;
    }
    notifyImportBatchesChanged();
    setSelected(new Set());
    toast.success(
      videos.length === 1
        ? "1 vídeo na fila. Acompanhe pelo aviso no canto da tela."
        : `${videos.length} vídeos na fila. Acompanhe pelo aviso no canto da tela.`,
    );
    startRefresh(() => router.refresh());
  }

  async function deletePlaylist() {
    setDeleting(true);
    const res = await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      setConfirmingDelete(false);
      toast.error("Não foi possível remover a playlist.");
      return;
    }
    router.push("/playlists");
    router.refresh();
  }

  const allNewSelected = newVideos.length > 0 && newVideos.every((v) => selected.has(v.videoId));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/playlists"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Playlists
      </Link>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-display-lg text-foreground">{playlist.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {playlist.videos.length === 1 ? "1 vídeo" : `${playlist.videos.length} vídeos`} · atualizada{" "}
            {refreshedAgo} ·{" "}
            <a
              href={`https://www.youtube.com/playlist?list=${playlist.playlistId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Abrir no YouTube <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={refreshFromYouTube} disabled={fetching}>
            <RefreshCw className={cn("size-4", fetching && "animate-spin")} />
            {fetching ? "Atualizando…" : "Atualizar"}
          </Button>
          {confirmingDelete ? (
            <>
              <Button type="button" variant="destructive" size="sm" onClick={deletePlaylist} disabled={deleting}>
                {deleting ? "Removendo…" : "Remover"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover playlist"
              title="Remover playlist (as receitas importadas continuam)"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {selectable.length > 0 && (
        <section className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground">
              {chosen.length === 0
                ? "Marque os vídeos que devem virar receitas."
                : chosen.length === 1
                  ? "1 vídeo marcado"
                  : `${chosen.length} vídeos marcados`}
            </p>
            {newVideos.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(allNewSelected ? new Set() : new Set(newVideos.map((v) => v.videoId)))
                }
              >
                {allNewSelected ? "Desmarcar todos" : "Marcar todos os não importados"}
              </Button>
            )}
          </div>
          {chosen.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end sm:justify-between">
              <TierPicker label="IA para ler os vídeos" value={tier} onChange={setTier} disabled={queueing} />
              <Button type="button" onClick={importChosen} disabled={queueing} className="sm:self-end">
                {queueing ? <Loader2 className="size-4 animate-spin" /> : <ListOrdered className="size-4" />}
                {chosen.length === 1 ? "Importar 1 receita" : `Importar ${chosen.length} receitas`}
              </Button>
            </div>
          )}
        </section>
      )}

      {playlist.videos.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Esta playlist não tem vídeos disponíveis.</p>
      ) : (
        <div className={cn("mt-8 flex flex-col gap-8 transition-opacity", isRefreshing && "opacity-70")}>
          {GROUPS.map((group) => {
            const videos = playlist.videos.filter((v) => group.statuses.includes(v.status));
            if (videos.length === 0 && !group.empty) return null;
            return (
              <section key={group.key} aria-labelledby={`group-${group.key}`}>
                <h2 id={`group-${group.key}`} className="flex items-baseline gap-2 font-display text-display-sm text-foreground">
                  {group.title}
                  <span className="font-sans text-sm font-normal text-muted-foreground">{videos.length}</span>
                </h2>
                {videos.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">{group.empty}</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1">
                    {videos.map((video) => (
                      <VideoRow
                        key={video.videoId}
                        video={video}
                        checked={selected.has(video.videoId)}
                        onCheckedChange={(checked) => toggle(video.videoId, checked)}
                        onIgnoredChange={(ignored) => setIgnored(video, ignored)}
                        toggling={togglingId === video.videoId}
                        disabled={queueing}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VideoRow({
  video,
  checked,
  onCheckedChange,
  onIgnoredChange,
  toggling,
  disabled,
}: {
  video: SavedPlaylistVideo;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onIgnoredChange: (ignored: boolean) => void;
  toggling: boolean;
  disabled: boolean;
}) {
  const title = cleanVideoTitle(video.title);
  const canSelect = isSelectable(video);

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg p-1.5 transition-colors",
        canSelect && "hover:bg-muted",
        checked && "bg-primary/5",
        video.status === "ignored" && "opacity-60",
      )}
    >
      {canSelect ? (
        <Checkbox
          checked={checked}
          onCheckedChange={(state) => onCheckedChange(state === true)}
          disabled={disabled}
          aria-label={`Importar “${title}”`}
        />
      ) : (
        // Keeps the rows lined up with the selectable ones.
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <a
        href={youTubeWatchUrl(video.videoId)}
        target="_blank"
        rel="noreferrer"
        className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:w-32"
        aria-label={`Assistir “${title}” no YouTube`}
      >
        {video.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail, already sized by YouTube
          <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        )}
        {video.status === "imported" && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-primary/90 py-0.5 text-[10px] font-medium text-primary-foreground">
            <CheckCircle2 className="size-3" /> Importada
          </span>
        )}
      </a>
      <div className="min-w-0 flex-1">
        {/* Clicking the title toggles it too, like a label; the checkbox is the keyboard target. */}
        <p
          className={cn("line-clamp-2 text-sm leading-snug text-foreground", canSelect && !disabled && "cursor-pointer")}
          onClick={canSelect && !disabled ? () => onCheckedChange(!checked) : undefined}
        >
          {video.isNew && (
            <span className="mr-1.5 inline-flex rounded-full bg-primary px-1.5 py-px align-[1px] text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
              Novo
            </span>
          )}
          {title}
        </p>
        <VideoStatusLine video={video} />
      </div>
      {(canSelect || video.status === "ignored") && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          disabled={toggling || disabled}
          onClick={() => onIgnoredChange(video.status !== "ignored")}
          aria-label={video.status === "ignored" ? `Não ignorar “${title}”` : `Ignorar “${title}”`}
        >
          {toggling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : video.status === "ignored" ? (
            <Eye className="size-4" />
          ) : (
            <EyeOff className="size-4" />
          )}
          <span className="hidden sm:inline">{video.status === "ignored" ? "Não ignorar" : "Ignorar"}</span>
        </Button>
      )}
    </li>
  );
}

function VideoStatusLine({ video }: { video: SavedPlaylistVideo }) {
  switch (video.status) {
    case "imported":
      return video.recipe ? (
        <Link
          href={`/recipes/${video.recipe.id}`}
          className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
        >
          <span className="truncate">Receita “{video.recipe.title}”</span>
        </Link>
      ) : null;
    case "queued":
      return (
        <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          {video.running ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Importando agora…
            </>
          ) : (
            <>
              <Clock className="size-3" /> Na fila de importação
            </>
          )}
        </span>
      );
    case "failed":
      return (
        <span className="mt-1 flex items-start gap-1 text-xs text-destructive">
          <AlertCircle className="mt-px size-3 shrink-0" />
          <span className="line-clamp-2">{video.error ?? "A importação falhou."}</span>
        </span>
      );
    default:
      return null;
  }
}
