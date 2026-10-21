-- Voice search by recipe name (the Alexa skill): word_similarity() ranks "cheesecake" against
-- "Cheesecake de frutas vermelhas" and survives small misrecognitions. Like unaccent (0002), pg_trgm
-- is a trusted contrib extension bundled with postgres:16.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "ingredient_substitution" (
	"recipe_id" text NOT NULL,
	"ingredient_key" text NOT NULL,
	"suggestions" jsonb NOT NULL,
	"tip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_substitution_unique" UNIQUE("recipe_id","ingredient_key")
);
--> statement-breakpoint
ALTER TABLE "ingredient_substitution" ADD CONSTRAINT "ingredient_substitution_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;