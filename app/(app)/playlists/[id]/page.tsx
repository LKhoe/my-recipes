import { notFound } from "next/navigation";
import { PlaylistManager } from "@/components/playlists/PlaylistManager";
import { requireSession } from "@/lib/session";
import { getPlaylist } from "@/lib/services/playlist";
import { formatTimeAgo } from "@/lib/format";

// One saved playlist: its videos by status, to import, ignore or refresh.
export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/playlists/${id}`);
  const playlist = await getPlaylist(session.user.id, id);
  if (!playlist) notFound();

  return <PlaylistManager playlist={playlist} refreshedAgo={formatTimeAgo(new Date(playlist.refreshedAt))} />;
}
