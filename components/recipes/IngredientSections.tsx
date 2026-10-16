import { formatIngredientLine } from "@/lib/format";
import { groupIngredientSections } from "@/lib/ingredient-groups";
import { cn } from "@/lib/utils";
import type { RecipeIngredientInput } from "@/types";

/**
 * The scaled ingredient list, with a heading over each section of a multi-part recipe ("Massa",
 * "Recheio"). Rows with no section render with no heading, so a flat recipe is one plain list.
 */
export function IngredientSections({
  ingredients,
  factor,
  listClassName,
  itemClassName,
}: {
  ingredients: RecipeIngredientInput[];
  factor: number;
  listClassName?: string;
  itemClassName?: string;
}) {
  const sections = groupIngredientSections(ingredients);

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.rows[0].index}>
          {section.group && <h3 className="mb-1.5 font-display text-base font-medium text-primary">{section.group}</h3>}
          <ul className={cn("flex flex-col text-sm", listClassName)}>
            {section.rows.map(({ item, index }) => (
              // Keyed to the factor so the number-roll animation replays on every rescale.
              <li key={`${index}-${factor}`} className={cn("animate-number-roll", itemClassName)}>
                {formatIngredientLine(item, factor)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
