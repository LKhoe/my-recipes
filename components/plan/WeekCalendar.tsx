"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecipePickerPopover } from "@/components/plan/RecipePickerPopover";
import type { MealPlanEntryView, MealSlot } from "@/lib/services/meal-plan";

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeekCalendar({
  days,
  entries,
  recipes,
}: {
  days: string[];
  entries: MealPlanEntryView[];
  recipes: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [dragEntryId, setDragEntryId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  function entriesFor(date: string, slot: MealSlot) {
    return entries.filter((e) => e.date === date && e.slot === slot);
  }

  async function assign(date: string, slot: MealSlot, recipeId: string) {
    const res = await fetch("/api/meal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, slot, recipeId }),
    });
    if (res.ok) router.refresh();
    else toast.error("Could not assign recipe");
  }

  async function moveEntry(entryId: string, date: string, slot: MealSlot) {
    const res = await fetch(`/api/meal-plan/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, slot }),
    });
    if (res.ok) router.refresh();
    else toast.error("Could not move recipe");
  }

  async function removeEntry(entryId: string) {
    const res = await fetch(`/api/meal-plan/${entryId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else toast.error("Could not remove recipe");
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[80px_repeat(7,1fr)] gap-2">
        <div />
        {days.map((date, i) => {
          const isToday = date === new Date().toISOString().slice(0, 10);
          return (
            <div key={date} className="pb-1 text-center">
              <p className="text-xs text-muted-foreground">{DAY_LABELS[i]}</p>
              <p className={cn("font-display text-sm", isToday && "text-primary")}>
                {Number(date.slice(8, 10))}
              </p>
            </div>
          );
        })}

        {SLOTS.map(({ key: slot, label }) => (
          <div key={slot} className="contents">
            <div className="flex items-center justify-end pr-2 text-xs font-medium text-muted-foreground">
              {label}
            </div>
            {days.map((date) => {
              const cellId = `${date}-${slot}`;
              const cellEntries = entriesFor(date, slot);
              const isDragOver = dragOverCell === cellId;

              return (
                <div
                  key={cellId}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverCell(cellId);
                  }}
                  onDragLeave={() => setDragOverCell((c) => (c === cellId ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCell(null);
                    const entryId = e.dataTransfer.getData("text/meal-plan-entry-id");
                    if (entryId) moveEntry(entryId, date, slot);
                  }}
                  className={cn(
                    "flex min-h-20 flex-col gap-1 rounded-lg border border-border bg-card p-1.5 transition-colors",
                    isDragOver && "border-primary bg-accent/40",
                  )}
                >
                  {cellEntries.map((entry) => (
                    <div
                      key={entry.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/meal-plan-entry-id", entry.id);
                        setDragEntryId(entry.id);
                      }}
                      onDragEnd={() => setDragEntryId(null)}
                      className={cn(
                        "group flex items-center gap-1 rounded-md bg-secondary px-1.5 py-1 text-xs text-secondary-foreground",
                        dragEntryId === entry.id && "opacity-40",
                      )}
                    >
                      <span className="line-clamp-2 flex-1">{entry.recipeTitle}</span>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100"
                        aria-label="Remove"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  <RecipePickerPopover recipes={recipes} onSelect={(recipeId) => assign(date, slot, recipeId)}>
                    <button
                      type="button"
                      className="mt-auto flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      <Plus className="size-3" /> Add
                    </button>
                  </RecipePickerPopover>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
