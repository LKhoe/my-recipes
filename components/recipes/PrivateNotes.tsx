"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function PrivateNotes({ recipeId, initialBody }: { recipeId: string; initialBody: string | null }) {
  const [body, setBody] = useState(initialBody ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/recipes/${recipeId}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        placeholder="Só você vê isso — ex.: 'usei menos sal, ficou ótimo'"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="min-h-20"
      />
      <div className="flex items-center gap-3 self-end">
        {saved && <span className="text-xs text-muted-foreground">Salvo</span>}
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={handleSave}>
          {saving ? "Salvando…" : "Salvar nota"}
        </Button>
      </div>
    </div>
  );
}
