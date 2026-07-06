import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";

// SPEC §4.7: private notes, visible only to their author.
export async function getUserNote(userId: string, recipeId: string): Promise<string | null> {
  const [row] = await db
    .select({ body: note.body })
    .from(note)
    .where(and(eq(note.userId, userId), eq(note.recipeId, recipeId)))
    .limit(1);
  return row?.body ?? null;
}

export async function setUserNote(userId: string, recipeId: string, body: string): Promise<void> {
  const trimmed = body.trim();

  if (!trimmed) {
    await db.delete(note).where(and(eq(note.userId, userId), eq(note.recipeId, recipeId)));
    return;
  }

  await db
    .insert(note)
    .values({ userId, recipeId, body: trimmed })
    .onConflictDoUpdate({
      target: [note.userId, note.recipeId],
      set: { body: trimmed, updatedAt: new Date() },
    });
}
