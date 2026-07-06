"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export function RecipePickerPopover({
  recipes,
  onSelect,
  children,
}: {
  recipes: { id: string; title: string }[];
  onSelect: (recipeId: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = recipes.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <Input
          autoFocus
          placeholder="Search recipes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2"
        />
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No recipes found</p>
          )}
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect(r.id);
                setOpen(false);
                setQuery("");
              }}
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              {r.title}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
