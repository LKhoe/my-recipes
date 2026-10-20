"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  PauseCircle,
  RotateCcw,
  SearchX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMPORT_BATCHES_CHANGED } from "@/lib/import-batch-events";
import type { ImportBatchItemView, ImportBatchView } from "@/lib/services/import-queue";
import { cn } from "@/lib/utils";
import { cleanVideoTitle } from "@/lib/youtube-utils";

// While something is importing. One video takes ~10-60 s, so this is plenty fresh.
const POLL_MS = 4000;
const COLLAPSED_KEY = "import-progress-collapsed";

type Counts = { total: number; finished: number; done: number; problems: number; active: boolean };

function countItems(items: ImportBatchItemView[]): Counts {
  const finished = items.filter((i) => !["pending", "running"].includes(i.status)).length;
  return {
    total: items.length,
    finished,
    done: items.filter((i) => i.status === "done").length,
    problems: items.filter((i) => i.status === "failed" || i.status === "no_recipe").length,
    active: finished < items.length,
  };
}

type QueueState = { batches: ImportBatchView[]; pausedUntil: string | null };

/** Null when the request fails (offline for a moment): the next poll or focus tries again. */
async function fetchBatches(): Promise<QueueState | null> {
  try {
    const res = await fetch("/api/import-batches", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function batchAction(batchId: string, action: "cancel" | "retry" | "dismiss") {
  await fetch(`/api/import-batches/${batchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).catch(() => {});
}

function StatusIcon({ status }: { status: ImportBatchItemView["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="size-4 text-muted-foreground" aria-label="Na fila" />;
    case "running":
      return <Loader2 className="size-4 animate-spin text-primary" aria-label="Importando" />;
    case "done":
      return <CheckCircle2 className="size-4 text-primary" aria-label="Importada" />;
    case "no_recipe":
      return <SearchX className="size-4 text-muted-foreground" aria-label="Sem receita" />;
    case "failed":
      return <AlertCircle className="size-4 text-destructive" aria-label="Falhou" />;
    case "cancelled":
      return <Ban className="size-4 text-muted-foreground" aria-label="Cancelada" />;
  }
}

const STATUS_TEXT: Record<ImportBatchItemView["status"], string> = {
  pending: "Na fila",
  running: "Importando…",
  done: "Importada",
  no_recipe: "Sem receita no vídeo",
  failed: "Falhou",
  cancelled: "Cancelada",
};

function ItemRow({ item, onNavigate }: { item: ImportBatchItemView; onNavigate?: () => void }) {
  const content = (
    <>
      <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded bg-muted">
        {item.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail
          <img src={item.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm text-foreground">{cleanVideoTitle(item.title)}</p>
        <p
          className={cn("line-clamp-2 text-xs text-muted-foreground", item.status === "failed" && "text-destructive")}
          title={item.error ?? undefined}
        >
          {item.status === "failed" && item.error
            ? `Falhou: ${item.error}`
            : item.refillSteps && item.status === "done"
              ? "Modo de preparo adicionado"
              : item.refillSteps && item.status === "pending"
                ? "Na fila · buscar modo de preparo"
                : STATUS_TEXT[item.status]}
        </p>
      </div>
      <StatusIcon status={item.status} />
    </>
  );

  if (item.status === "done" && item.recipeId) {
    return (
      <Link
        href={`/recipes/${item.recipeId}`}
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-muted"
      >
        {content}
      </Link>
    );
  }
  return <div className="flex items-center gap-2.5 p-1.5">{content}</div>;
}

function ProgressBar({ counts }: { counts: Counts }) {
  const percent = counts.total ? Math.round((counts.finished / counts.total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={counts.total}
      aria-valuenow={counts.finished}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

function summary(counts: Counts): string {
  if (counts.active) return `${counts.finished} de ${counts.total}`;
  const parts = [`${counts.done} ${counts.done === 1 ? "importada" : "importadas"}`];
  if (counts.problems) parts.push(`${counts.problems} com problema`);
  return parts.join(" · ");
}

/** One batch's list and its actions, shared by the desktop card and the mobile sheet. */
function BatchSection({
  batch,
  showTitle,
  onChanged,
  onNavigate,
}: {
  batch: ImportBatchView;
  showTitle: boolean;
  onChanged: () => void;
  onNavigate?: () => void;
}) {
  const counts = countItems(batch.items);
  const [busy, setBusy] = useState(false);
  const retryable = batch.items.some((i) => i.status === "failed" || i.status === "cancelled");
  const runningRef = useRef<HTMLLIElement>(null);

  // Keeps the video being imported in view as the list advances.
  const runningId = batch.items.find((i) => i.status === "running")?.id;
  useEffect(() => {
    runningRef.current?.scrollIntoView({ block: "nearest" });
  }, [runningId]);

  async function run(action: "cancel" | "retry" | "dismiss") {
    setBusy(true);
    await batchAction(batch.id, action);
    onChanged();
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-2">
      {showTitle && (
        <div className="flex items-baseline justify-between gap-2 px-1.5">
          <p className="line-clamp-1 text-xs font-medium text-foreground">{batch.title || "Playlist"}</p>
          <p className="shrink-0 text-xs text-muted-foreground">{summary(counts)}</p>
        </div>
      )}
      <ul className="flex flex-col">
        {batch.items.map((item) => (
          <li key={item.id} ref={item.id === runningId ? runningRef : undefined}>
            <ItemRow item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-1.5 px-1.5">
        {counts.active ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run("cancel")}>
            Cancelar os que faltam
          </Button>
        ) : (
          <>
            {retryable && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run("retry")}>
                <RotateCcw className="size-3.5" /> Tentar de novo
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run("dismiss")}>
              Fechar
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Follows the user's playlist imports from any page: a card in the bottom-right corner from `sm`
 * up, a pill above the tab bar on phones that opens a bottom sheet. The imports run on the server
 * (lib/services/import-queue.ts), so leaving or reloading a page loses nothing; this only polls
 * while something is still importing.
 */
export function ImportProgress() {
  const router = useRouter();
  const [batches, setBatches] = useState<ImportBatchView[]>([]);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  // Nothing renders before the first fetch, so reading storage here can't mismatch the server HTML.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const doneCountRef = useRef<number | null>(null);

  const load = useCallback(
    () =>
      fetchBatches().then((state) => {
        if (!state) return;
        const next = state.batches;
        setBatches(next);
        setPausedUntil(state.pausedUntil);
        // A new recipe changes the "Para revisar" count and lists: refresh the server components.
        // On the first fetch the page may have been rendered a moment before a video finished, so
        // it refreshes once if anything is still importing.
        const items = next.flatMap((b) => b.items);
        const done = items.filter((i) => i.status === "done").length;
        const firstWhileActive = doneCountRef.current === null && countItems(items).active;
        if (firstWhileActive || (doneCountRef.current !== null && done > doneCountRef.current)) router.refresh();
        doneCountRef.current = done;
      }),
    [router],
  );

  const allItems = batches.flatMap((b) => b.items);
  const counts = countItems(allItems);

  useEffect(() => {
    void load();
    const refetch = () => void load();
    window.addEventListener(IMPORT_BATCHES_CHANGED, refetch);
    window.addEventListener("focus", refetch);
    return () => {
      window.removeEventListener(IMPORT_BATCHES_CHANGED, refetch);
      window.removeEventListener("focus", refetch);
    };
  }, [load]);

  useEffect(() => {
    if (!counts.active) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [counts.active, load]);

  if (batches.length === 0) return null;

  function toggleCollapsed() {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? "0" : "1");
      } catch {
        // Not remembered, still toggles.
      }
      return !prev;
    });
  }

  const paused = counts.active && pausedUntil !== null;
  const heading = paused ? "Importação pausada" : counts.active ? "Importando receitas" : "Importação concluída";
  const pauseNotice = paused && (
    <p className="rounded-lg bg-accent/40 px-2.5 py-2 text-xs text-accent-foreground">
      O YouTube bloqueou as legendas por um tempo. Para não salvar receitas sem modo de preparo, a importação
      volta a tentar às{" "}
      {new Date(pausedUntil!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
    </p>
  );
  const sections = batches.map((batch) => (
    <BatchSection key={batch.id} batch={batch} showTitle={batches.length > 1} onChanged={load} />
  ));

  return (
    <>
      {/* Desktop and tablet: a card in the corner */}
      <div
        className="fixed bottom-4 right-4 z-40 hidden w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-300 sm:flex"
        role="region"
        aria-label="Progresso da importação"
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            {paused ? (
              <PauseCircle className="size-4 shrink-0 text-muted-foreground" />
            ) : counts.active ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
            )}
            <span className="flex-1 truncate text-sm font-medium text-foreground">{heading}</span>
            {collapsed ? (
              <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            )}
          </div>
          <ProgressBar counts={counts} />
          <span className="text-xs text-muted-foreground">{summary(counts)}</span>
        </button>
        {!collapsed && (
          <div className="flex max-h-[min(24rem,60vh)] flex-col gap-4 overflow-y-auto border-t border-border px-2.5 py-2.5">
            {pauseNotice}
            {sections}
          </div>
        )}
      </div>

      {/* Phone: a pill above the tab bar that opens a bottom sheet */}
      <DialogPrimitive.Root open={sheetOpen && batches.length > 0} onOpenChange={setSheetOpen}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-40 flex items-center gap-2 rounded-full border border-border bg-card py-2 pl-2.5 pr-3.5 text-sm shadow-soft-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-300 sm:hidden"
          >
            <ProgressRing counts={counts} />
            <span className="font-medium text-foreground">
              {paused
                ? `Pausada ${counts.finished}/${counts.total}`
                : counts.active
                  ? `Importando ${counts.finished}/${counts.total}`
                  : "Importação concluída"}
            </span>
          </button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:hidden" />
          <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-soft-lg outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom duration-300 sm:hidden">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" aria-hidden />
            <div className="flex items-center gap-2 px-4 pb-2 pt-3">
              <DialogPrimitive.Title className="flex-1 font-display text-lg font-medium text-foreground">
                {heading}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar">
                  <X className="size-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="px-4 text-sm text-muted-foreground">
              {summary(counts)}
              {counts.active && ". As receitas continuam sendo importadas mesmo se você sair do site."}
            </DialogPrimitive.Description>
            <div className="px-4 pt-3">
              <ProgressBar counts={counts} />
            </div>
            <div className="mt-3 flex flex-col gap-4 overflow-y-auto px-2.5 pb-4">
              {pauseNotice}
              {batches.map((batch) => (
                <BatchSection
                  key={batch.id}
                  batch={batch}
                  showTitle={batches.length > 1}
                  onChanged={load}
                  onNavigate={() => setSheetOpen(false)}
                />
              ))}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function ProgressRing({ counts }: { counts: Counts }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const fraction = counts.total ? counts.finished / counts.total : 0;
  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={radius} fill="none" strokeWidth="3" className="stroke-muted" />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        className="stroke-primary transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}
