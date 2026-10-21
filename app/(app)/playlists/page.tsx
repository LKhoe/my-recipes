import Link from "next/link";
import { ListVideo } from "lucide-react";
import { AddPlaylistForm } from "@/components/playlists/AddPlaylistForm";
import { requireSession } from "@/lib/session";
import { listPlaylists, type SavedPlaylistSummary } from "@/lib/services/playlist";
import { formatTimeAgo } from "@/lib/format";

function countsLine({ counts }: SavedPlaylistSummary): string {
  const toImport = counts.new + counts.queued;
  return [
    `${toImport} para importar`,
    counts.imported > 0 && `${counts.imported} ${counts.imported === 1 ? "importado" : "importados"}`,
    counts.failed > 0 && `${counts.failed} com falha`,
    counts.ignored > 0 && `${counts.ignored} ${counts.ignored === 1 ? "ignorado" : "ignorados"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// The user's saved YouTube playlists, and the form to register another.
export default async function PlaylistsPage() {
  const session = await requireSession("/playlists");
  const playlists = await listPlaylists(session.user.id);
  const now = new Date();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Playlists</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Cadastre as playlists de receitas que você acompanha no YouTube. Em cada uma dá para ver o que já virou
        receita, importar o resto, ignorar o que não interessa e atualizar para pegar os vídeos novos.
      </p>

      <section className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <AddPlaylistForm />
      </section>

      {playlists.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <ListVideo className="size-10 text-muted-foreground" />
          <p className="font-display text-display-sm text-foreground">Nenhuma playlist ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cole acima o link de uma playlist pública ou não listada do YouTube.
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link
                href={`/playlists/${playlist.id}`}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted"
              >
                <div className="aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-muted sm:w-36">
                  {playlist.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail, already sized by YouTube
                    <img src={playlist.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-display text-base font-medium leading-snug text-foreground">
                    {playlist.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{countsLine(playlist)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Atualizada {formatTimeAgo(new Date(playlist.refreshedAt), now)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
