-- Fuzzy, accent- and case-insensitive recipe title search for the web list and the Alexa skill
-- (lib/services/recipe-search.ts). pg_trgm and unaccent are trusted extensions, so the database
-- owner role can create them (both may already exist, from migrations 0002 and 0010).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() is only STABLE (it depends on a dictionary), which Postgres refuses in an index
-- expression. Pinning the dictionary by name makes this wrapper safe to declare IMMUTABLE.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
-- Serves LIKE '%x%', the % / <% operators and ILIKE on the normalised title. Queries must use the
-- same expression: f_unaccent(lower(title)).
CREATE INDEX IF NOT EXISTS "recipe_title_trgm_idx" ON "recipe" USING gin (f_unaccent(lower("title")) gin_trgm_ops);
