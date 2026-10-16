-- Data migration: hyphens now count as spaces in ingredient names (normalizeIngredientName), so
-- "pimenta-do-reino" and "pimenta do reino" are one ingredient. Rows saved before that keep their
-- hyphenated name, and saving a recipe now looks up the hyphen-free name, so the two never merge
-- on a shopping list. Per hyphen-free name, this keeps one row (the existing hyphen-free one, else
-- one of the hyphenated ones, renamed), points recipe_ingredient and shopping_list_item at it, and
-- deletes the rest. Runs inside the migrator's transaction, so the temp table drops on commit.
CREATE TEMP TABLE ingredient_merge ON COMMIT DROP AS
WITH hyphenated AS (
  SELECT id, trim(regexp_replace(replace(name, '-', ' '), '\s+', ' ', 'g')) AS target
  FROM ingredient
  WHERE name LIKE '%-%'
),
keeper AS (
  SELECT h.target, coalesce((SELECT i.id FROM ingredient i WHERE i.name = h.target), min(h.id)) AS keeper_id
  FROM hyphenated h
  GROUP BY h.target
)
SELECT h.id AS old_id, k.keeper_id, k.target
FROM hyphenated h
JOIN keeper k ON k.target = h.target;
--> statement-breakpoint
UPDATE recipe_ingredient ri
SET ingredient_id = m.keeper_id
FROM ingredient_merge m
WHERE ri.ingredient_id = m.old_id AND m.old_id <> m.keeper_id;
--> statement-breakpoint
UPDATE shopping_list_item sli
SET ingredient_id = m.keeper_id
FROM ingredient_merge m
WHERE sli.ingredient_id = m.old_id AND m.old_id <> m.keeper_id;
--> statement-breakpoint
DELETE FROM ingredient i
USING ingredient_merge m
WHERE i.id = m.old_id AND m.old_id <> m.keeper_id;
--> statement-breakpoint
UPDATE ingredient i
SET name = m.target
FROM ingredient_merge m
WHERE i.id = m.keeper_id AND i.name <> m.target;
