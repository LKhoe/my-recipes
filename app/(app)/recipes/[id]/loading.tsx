import { Skeleton } from "@/components/ui/skeleton";

export default function RecipeDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Skeleton className="mb-6 aspect-16/9 w-full rounded-2xl" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />

      <div className="mt-4 flex gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-[minmax(0,1fr)_2fr]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-40 rounded-md" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
