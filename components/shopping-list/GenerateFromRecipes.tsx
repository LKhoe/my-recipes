"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function GenerateFromRecipes({ recipes }: { recipes: { id: string; title: string }[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const filtered = recipes.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    if (selected.size === 0) {
      toast.error("Pick at least one recipe.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/shopping-list/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeIds: Array.from(selected) }),
    });
    setLoading(false);
    if (res.ok) {
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error("Could not generate shopping list");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <Input placeholder="Search recipes…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {filtered.map((r) => (
          <label key={r.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
            {r.title}
          </label>
        ))}
        {filtered.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No recipes found</p>}
      </div>
      <Button type="button" onClick={handleGenerate} disabled={loading} className="self-start">
        {loading ? "Generating…" : `Generate from ${selected.size || ""} recipe${selected.size === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
