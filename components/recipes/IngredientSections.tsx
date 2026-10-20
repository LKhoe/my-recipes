import { formatIngredientChoice } from "@/lib/format";
import { groupAlternatives } from "@/lib/ingredient-alternatives";
import { groupIngredientSections } from "@/lib/ingredient-groups";
import { cn } from "@/lib/utils";
import type { RecipeIngredientInput } from "@/types";

/**
 * The scaled ingredient list, with a heading over each section of a multi-part recipe ("Massa",
 * "Recheio"). Rows with no section render with no heading, so a flat recipe is one plain list.
 * An ingredient's "or" options share its line ("manteiga ou margarina").
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
            {groupAlternatives(section.rows).map(({ primary, alternatives }) => (
              // Keyed to the factor so the number-roll animation replays on every rescale.
              <li key={`${primary.index}-${factor}`} className={cn("animate-number-roll", itemClassName)}>
                {formatIngredientChoice(
                  primary.item,
                  alternatives.map((a) => a.item),
                  factor,
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
