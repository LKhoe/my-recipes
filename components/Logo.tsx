import { cn } from "@/lib/utils";
import { RecipeBowlMark } from "@/components/icons/RecipeBowlMark";

export function Logo({ className, iconClassName, textClassName }: {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <RecipeBowlMark className={cn("size-7", iconClassName)} />
      <span className={cn("font-display text-display-sm text-foreground", textClassName)}>
        Minhas Receitas
      </span>
    </span>
  );
}
