"use client";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, Plus } from "lucide-react";
import type { RecipeStep } from "@/types";

export function StepsEditor({
  value,
  onChange,
}: {
  value: RecipeStep[];
  onChange: (next: RecipeStep[]) => void;
}) {
  function updateRow(index: number, patch: Partial<RecipeStep>) {
    const next = value.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...value, { text: "" }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Modo de preparo</Label>
      <div className="flex flex-col gap-2">
        {value.map((row, index) => (
          <div key={index} className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2">
            <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {index + 1}
            </span>
            <Textarea
              className="min-h-16 flex-1"
              placeholder="O que fazer nesta etapa"
              required
              value={row.text}
              onChange={(e) => updateRow(index, { text: e.target.value })}
            />
            <div className="flex w-28 flex-col gap-1">
              <Input
                type="number"
                min={0}
                placeholder="Minutos"
                value={row.durationMinutes ?? ""}
                onChange={(e) =>
                  updateRow(index, {
                    durationMinutes: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRow(index)}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRow}>
        <Plus className="size-4" /> Adicionar etapa
      </Button>
    </div>
  );
}
