"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: { id: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Categorias</Label>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const active = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-foreground hover:bg-muted",
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
