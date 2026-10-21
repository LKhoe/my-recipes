"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseYouTubePlaylistId } from "@/lib/youtube-utils";

/** Registers a YouTube playlist by its link, then opens its page. */
export function AddPlaylistForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parseYouTubePlaylistId(url.trim())) {
      setError("Cole o link de uma playlist do YouTube (com “list=” no endereço).");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Não foi possível cadastrar a playlist.");
      setSaving(false);
      return;
    }
    if (body.existed) toast("Você já tinha cadastrado essa playlist.");
    router.push(`/playlists/${body.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="playlist-url">Link da playlist</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="playlist-url"
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/playlist?list=…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          disabled={saving}
          className="flex-1"
        />
        <Button type="submit" disabled={saving || !url.trim()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {saving ? "Lendo a playlist…" : "Cadastrar"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
