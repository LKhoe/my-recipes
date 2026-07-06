"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export function TagsInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tags-input">Etiquetas</Label>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-input px-2 py-1.5">
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== t))}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          id="tags-input"
          className="h-7 flex-1 border-none shadow-none focus-visible:ring-0"
          placeholder="Adicione uma tag e pressione Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={commitDraft}
        />
      </div>
    </div>
  );
}
