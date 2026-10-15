import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listMealPlanEntries } from "@/lib/services/meal-plan";
import { listRecipes } from "@/lib/services/recipe";
import { addDays, formatDateISO, getWeekDays, getWeekStart } from "@/lib/date-utils";
import { WeekCalendar } from "@/components/plan/WeekCalendar";
import { Button } from "@/components/ui/button";
import { GenerateShoppingListButton } from "@/components/plan/GenerateShoppingListButton";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireSession("/plan");
  const { week } = await searchParams;
  const anchor = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00`) : new Date();
  const weekStart = getWeekStart(anchor);
  const weekDays = getWeekDays(weekStart).map(formatDateISO);
  const weekEnd = weekDays[6];

  const [entries, recipes] = await Promise.all([
    listMealPlanEntries(weekDays[0], weekEnd),
    listRecipes(),
  ]);

  const prevWeek = formatDateISO(addDays(weekStart, -7));
  const nextWeek = formatDateISO(addDays(weekStart, 7));
  const recipeIds = Array.from(new Set(entries.map((e) => e.recipeId)));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-display-lg text-foreground">Planejamento de Refeições</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={`/plan?week=${prevWeek}`} aria-label="Semana anterior">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <span className="min-w-40 text-center text-sm text-muted-foreground">
            {weekDays[0]} – {weekEnd}
          </span>
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={`/plan?week=${nextWeek}`} aria-label="Próxima semana">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <GenerateShoppingListButton recipeIds={recipeIds} />
        </div>
      </div>

      <div className="mt-8">
        <WeekCalendar days={weekDays} today={formatDateISO(new Date())} entries={entries} recipes={recipes.map((r) => ({ id: r.id, title: r.title }))} />
      </div>
    </div>
  );
}
