import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipeTip, user } from "@/lib/db/schema";

export type TipView = {
  id: string;
  body: string;
  stepIndex: number | null;
  userId: string;
  userName: string | null;
  createdAt: string;
};

const MAX_TIP_LENGTH = 1000;

/**
 * Circle-shared "pulo do gato" tips — like recipeCookPhoto, visible to everyone rather than
 * private like rating/note. `stepIndex` null means a general tip for the whole recipe; otherwise
 * it's a plain index into `recipe.steps`.
 */
export async function listTips(recipeId: string): Promise<TipView[]> {
  const rows = await db
    .select({
      id: recipeTip.id,
      body: recipeTip.body,
      stepIndex: recipeTip.stepIndex,
      userId: recipeTip.userId,
      userName: user.name,
      createdAt: recipeTip.createdAt,
    })
    .from(recipeTip)
    .leftJoin(user, eq(recipeTip.userId, user.id))
    .where(eq(recipeTip.recipeId, recipeId))
    .orderBy(asc(recipeTip.createdAt));

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function addTip(
  recipeId: string,
  userId: string,
  body: string,
  stepIndex: number | null,
): Promise<{ id: string }> {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("A dica não pode estar vazia.");
  }
  if (trimmed.length > MAX_TIP_LENGTH) {
    throw new Error(`A dica pode ter no máximo ${MAX_TIP_LENGTH} caracteres.`);
  }

  const [created] = await db
    .insert(recipeTip)
    .values({ recipeId, userId, body: trimmed, stepIndex })
    .returning({ id: recipeTip.id });

  return created;
}

/** Only the tip's own author can delete it — same ownership model as a cook photo. */
export async function deleteTip(tipId: string, userId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(recipeTip)
    .where(and(eq(recipeTip.id, tipId), eq(recipeTip.userId, userId)))
    .returning({ id: recipeTip.id });

  return !!deleted;
}
