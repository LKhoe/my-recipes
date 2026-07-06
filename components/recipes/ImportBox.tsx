"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { RecipeDraft } from "@/types";

export function ImportBox({ onImported }: { onImported: (draft: RecipeDraft) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Import failed.");
      onImported(body as RecipeDraft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleImport} className="flex flex-col gap-3">
      <Label htmlFor="import-url">Recipe or YouTube URL</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="import-url"
          type="url"
          required
          placeholder="https://example.com/recipe or a YouTube link"
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
            "Import"
          )}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
