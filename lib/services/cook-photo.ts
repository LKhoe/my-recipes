import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipeCookPhoto, user } from "@/lib/db/schema";
import { deleteImageFiles, ImageValidationError, processAndStoreImage } from "@/lib/services/image";
import { MAX_PHOTOS_PER_RECIPE } from "@/lib/image-constants";

export type CookPhotoView = {
  id: string;
  path: string;
  userId: string;
  userName: string | null;
  createdAt: string;
};

/**
 * Circle members' own "I made this" photos of the finished dish — a shared gallery (visible to
 * the whole circle, not private), distinct from the recipe's own cover photos. Not spec'd; see
 * DECISIONS.md "Feat: photos of the finished dish."
 */
export async function listCookPhotos(recipeId: string): Promise<CookPhotoView[]> {
  const rows = await db
    .select({
      id: recipeCookPhoto.id,
      path: recipeCookPhoto.path,
      userId: recipeCookPhoto.userId,
      userName: user.name,
      createdAt: recipeCookPhoto.createdAt,
    })
    .from(recipeCookPhoto)
    .leftJoin(user, eq(recipeCookPhoto.userId, user.id))
    .where(eq(recipeCookPhoto.recipeId, recipeId))
    .orderBy(desc(recipeCookPhoto.createdAt));

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function countUserCookPhotos(recipeId: string, userId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipeCookPhoto)
    .where(and(eq(recipeCookPhoto.recipeId, recipeId), eq(recipeCookPhoto.userId, userId)));
  return count;
}

export async function addCookPhoto(
  recipeId: string,
  userId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ id: string; path: string }> {
  const existingCount = await countUserCookPhotos(recipeId, userId);
  if (existingCount >= MAX_PHOTOS_PER_RECIPE) {
    throw new ImageValidationError(`Você pode enviar no máximo ${MAX_PHOTOS_PER_RECIPE} fotos por receita.`);
  }

  const { path: storedPath } = await processAndStoreImage(
    `recipes/${recipeId}/cooked`,
    buffer,
    mimeType,
  );

  const [created] = await db
    .insert(recipeCookPhoto)
    .values({ recipeId, userId, path: storedPath })
    .returning({ id: recipeCookPhoto.id, path: recipeCookPhoto.path });

  return created;
}

/** Only the photo's own uploader can delete it — same ownership model as a private note/rating. */
export async function deleteCookPhoto(photoId: string, userId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(recipeCookPhoto)
    .where(and(eq(recipeCookPhoto.id, photoId), eq(recipeCookPhoto.userId, userId)))
    .returning({ path: recipeCookPhoto.path });

  if (!deleted) return false;

  await deleteImageFiles(deleted.path);
  return true;
}
