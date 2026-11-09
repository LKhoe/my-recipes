import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  SEARCH_SIMILARITY_THRESHOLD,
  SEARCH_WHOLE_SIMILARITY_THRESHOLD,
  cleanSearchQuery,
  escapeLike,
} from "@/lib/recipe-search";

/**
 * Fuzzy recipe title search on Postgres pg_trgm + unaccent (migration 0013), shared by the web list
 * (`listRecipes`) and the Alexa skill (`searchRecipesByTitle`) so a name finds the same recipes in
 * both. Case- and accent-insensitive: titles and the query go through `f_unaccent(lower(...))`, the
 * exact expression the GIN index `recipe_title_trgm_idx` is built on, and the match uses the
 * index-capable operators `LIKE '%x%'`, `<%` (word similarity) and `%` (similarity).
 */

export type TitleSearch = {
  /** WHERE fragment: the title contains the query or is trigram-similar to it. */
  match: SQL;
  /** 0..1, how well the title fits (word similarity or whole-string similarity, whichever is higher). */
  score: SQL<number>;
  /** The title equals the query (ignoring case and accents). */
  exact: SQL<boolean>;
  /** The title starts with the query. */
  prefix: SQL<boolean>;
  /** The title contains the query. */
  contains: SQL<boolean>;
};

/** Builds the fragments for a user's query, or null when there is nothing to search for. */
export function buildTitleSearch(rawQuery: string | null | undefined, titleColumn: AnyPgColumn): TitleSearch | null {
  const q = cleanSearchQuery(rawQuery);
  if (!q) return null;

  const title = sql`f_unaccent(lower(${titleColumn}))`;
  const needle = sql`f_unaccent(lower(${q}))`;
  const likeNeedle = sql`f_unaccent(lower(${escapeLike(q)}))`;

  const contains = sql<boolean>`${title} like '%' || ${likeNeedle} || '%'`;
  return {
    // `<%` and `%` read their thresholds from the pg_trgm.* settings: run inside withSearchThresholds.
    match: sql`(${contains} or ${needle} <% ${title} or ${title} % ${needle})`,
    score: sql<number>`greatest(word_similarity(${needle}, ${title}), similarity(${needle}, ${title}))`,
    exact: sql<boolean>`${title} = ${needle}`,
    prefix: sql<boolean>`${title} like ${likeNeedle} || '%'`,
    contains,
  };
}

type Executor = Pick<typeof db, "select" | "execute">;

/**
 * Runs `fn` in a transaction with this module's similarity thresholds set locally (`SET LOCAL`
 * semantics via set_config(..., true)), because the `<%` and `%` operators take their cut-off from
 * settings, not from an argument. They revert when the transaction ends, so the pooled connection
 * is left as it was.
 */
export async function withSearchThresholds<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('pg_trgm.word_similarity_threshold', ${String(SEARCH_SIMILARITY_THRESHOLD)}, true),
                 set_config('pg_trgm.similarity_threshold', ${String(SEARCH_WHOLE_SIMILARITY_THRESHOLD)}, true)`,
    );
    return fn(tx as unknown as Executor);
  });
}
