-- Accent-insensitive search (SPEC §4.2: "adequate at this scale" ILIKE search) — a user typing
-- "salmao" (no diacritic, extremely common in pt-BR: non-Brazilian keyboards, fast typing,
-- autocomplete) previously got zero results against a recipe literally titled "Salmão...".
-- unaccent() is a standard Postgres contrib extension (bundled with postgres:16-alpine), not a
-- third-party dependency.
CREATE EXTENSION IF NOT EXISTS unaccent;
