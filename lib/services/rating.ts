import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rating } from "@/lib/db/schema";

// SPEC §4.7 / §3: ratings are private per-user — no circle-visible aggregate.
export async function getUserRating(userId: string, recipeId: string): Promise<number | null> {
  const [row] = await db
    .select({ score: rating.score })
    .from(rating)
    .where(and(eq(rating.userId, userId), eq(rating.recipeId, recipeId)))
    .limit(1);
  return row?.score ?? null;
}

export async function setUserRating(userId: string, recipeId: string, score: number): Promise<void> {
  await db
    .insert(rating)
    .values({ userId, recipeId, score })
    .onConflictDoUpdate({
      target: [rating.userId, rating.recipeId],
      set: { score, updatedAt: new Date() },
    });
}

export async function clearUserRating(userId: string, recipeId: string): Promise<void> {
  await db.delete(rating).where(and(eq(rating.userId, userId), eq(rating.recipeId, recipeId)));
}
