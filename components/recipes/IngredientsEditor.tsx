"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, Plus, Sparkles } from "lucide-react";
import type { RecipeIngredientInput } from "@/types";

export function IngredientsEditor({
  value,
  onChange,
}: {
  value: RecipeIngredientInput[];
  onChange: (next: RecipeIngredientInput[]) => void;
}) {
  function updateRow(index: number, patch: Partial<RecipeIngredientInput>) {
    const next = value.slice();
    next[index] = { ...next[index], ...patch, inferred: patch.inferred ?? false };
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...value, { ingredientName: "", quantity: null, unit: null, note: null }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Ingredients</Label>
      <div className="flex flex-col gap-2">
        {value.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
            <Input
              className="w-20"
              placeholder="Qty"
              inputMode="decimal"
              value={row.quantity ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                updateRow(index, { quantity: raw === "" ? null : Number(raw) });
              }}
            />
            <Input
              className="w-24"
              placeholder="Unit"
              value={row.unit ?? ""}
              onChange={(e) => updateRow(index, { unit: e.target.value || null })}
            />
            <Input
              className="min-w-40 flex-1"
              placeholder="Ingredient"
              required
              value={row.ingredientName}
              onChange={(e) => updateRow(index, { ingredientName: e.target.value })}
            />
            <Input
              className="min-w-32 flex-1"
              placeholder="Note (optional)"
              value={row.note ?? ""}
              onChange={(e) => updateRow(index, { note: e.target.value || null })}
            />
            {row.inferred && (
              <span
                title="Quantity estimated during import — verify before saving"
                className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
              >
                <Sparkles className="size-3" /> estimated
              </span>
            )}
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRow(index)}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRow}>
        <Plus className="size-4" /> Add ingredient
      </Button>
    </div>
  );
}
