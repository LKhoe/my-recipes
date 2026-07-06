import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { category } from "@/lib/db/schema";

export async function listCategories(): Promise<{ id: string; name: string }[]> {
  return db.select({ id: category.id, name: category.name }).from(category).orderBy(asc(category.name));
}
