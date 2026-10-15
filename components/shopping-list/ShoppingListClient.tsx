"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatScaledQuantity } from "@/lib/scale";
import type { ShoppingListItemView } from "@/lib/services/shopping-list";

function formatLine(item: ShoppingListItemView): string {
  return [formatScaledQuantity(item.quantity, item.unit), item.unit].filter(Boolean).join(" ");
}

export function ShoppingListClient({ items }: { items: ShoppingListItemView[] }) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function toggleChecked(item: ShoppingListItemView) {
    setLocalItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
    const res = await fetch(`/api/shopping-list/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: !item.checked }),
    });
    if (!res.ok) {
      setLocalItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)));
      toast.error("Não foi possível atualizar o item");
    }
  }

  async function removeItem(itemId: string) {
    setLocalItems((prev) => prev.filter((i) => i.id !== itemId));
    const res = await fetch(`/api/shopping-list/items/${itemId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Não foi possível remover o item");
      router.refresh();
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/shopping-list/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), quantity: null, unit: null }),
    });
    setAdding(false);
    if (res.ok) {
      const created = await res.json();
      setLocalItems((prev) => [...prev, { id: created.id, ingredientId: null, name: newName.trim(), quantity: null, unit: null, checked: false, order: prev.length }]);
      setNewName("");
    } else {
      toast.error("Não foi possível adicionar o item");
    }
  }

  const groups = new Map<string, { name: string; items: ShoppingListItemView[] }>();
  for (const item of localItems) {
    const key = item.ingredientId ?? `custom-${item.id}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { name: item.name, items: [item] });
  }
  const sortedGroups = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={addItem} className="flex gap-2">
        <Input
          placeholder="Adicionar um item…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={adding}
        />
        <Button type="submit" disabled={adding}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </form>

      {sortedGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não há itens.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {sortedGroups.map((group) => (
            <li key={group.name + group.items[0].id}>
              {group.items.length > 1 && (
                <p className="mb-1 text-sm font-medium text-foreground">{group.name}</p>
              )}
              <ul className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-300 hover:bg-muted/50",
                      item.checked && "bg-success/5",
                    )}
                  >
                    <Checkbox checked={item.checked} onCheckedChange={() => toggleChecked(item)} />
                    <span
                      className={cn(
                        "flex-1 text-sm transition-colors duration-300",
                        item.checked && "text-muted-foreground opacity-60",
                      )}
                    >
                      <span className="relative inline-block">
                        {group.items.length > 1 ? formatLine(item) || "—" : [formatLine(item), item.name].filter(Boolean).join(" ")}
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute inset-x-0 top-1/2 h-px origin-left -translate-y-1/2 bg-current transition-transform duration-300 ease-out",
                            item.checked ? "scale-x-100" : "scale-x-0",
                          )}
                        />
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="-my-1.5 rounded-md p-1.5 text-muted-foreground transition-opacity hover:text-destructive focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                      aria-label="Remover item"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
