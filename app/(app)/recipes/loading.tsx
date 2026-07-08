import { Skeleton } from "@/components/ui/skeleton";

export default function RecipesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-48 flex-1 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Skeleton className="aspect-4/3 w-full rounded-none" />
            <div className="flex flex-1 flex-col gap-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="mt-auto flex gap-1.5 pt-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
