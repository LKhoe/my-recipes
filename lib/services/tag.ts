import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tag } from "@/lib/db/schema";

export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function findOrCreateTag(rawName: string): Promise<{ id: string; name: string }> {
  const name = normalizeTagName(rawName);

  const [existing] = await db.select().from(tag).where(eq(tag.name, name)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(tag).values({ name }).onConflictDoNothing({ target: tag.name }).returning();
  if (created) return created;

  const [row] = await db.select().from(tag).where(eq(tag.name, name)).limit(1);
  return row;
}
