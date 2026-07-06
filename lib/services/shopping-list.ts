import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingredient, recipeIngredient, shoppingList, shoppingListItem } from "@/lib/db/schema";
import { mergeIngredientsForShoppingList } from "@/lib/shopping-list-merge";

export type ShoppingListItemView = {
  id: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  order: number;
};

export type ShoppingListView = {
  id: string;
  createdAt: string;
  items: ShoppingListItemView[];
};

/** SPEC §4.5: generate from one or more recipes (a caller resolves "planned meals" to recipe ids). */
export async function generateShoppingList(userId: string, recipeIds: string[]): Promise<{ id: string }> {
  const ingredientRows =
    recipeIds.length === 0
      ? []
      : await db
          .select({
            ingredientId: recipeIngredient.ingredientId,
            ingredientName: ingredient.name,
            quantity: recipeIngredient.quantity,
            unit: recipeIngredient.unit,
          })
          .from(recipeIngredient)
          .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
          .where(inArray(recipeIngredient.recipeId, recipeIds));

  const merged = mergeIngredientsForShoppingList(
    ingredientRows.map((r) => ({
      ingredientId: r.ingredientId,
      ingredientName: r.ingredientName,
      quantity: r.quantity !== null ? Number(r.quantity) : null,
      unit: r.unit,
    })),
  );

  return db.transaction(async (tx) => {
    const [list] = await tx.insert(shoppingList).values({ userId }).returning({ id: shoppingList.id });

    if (merged.length > 0) {
      await tx.insert(shoppingListItem).values(
        merged.map((line, index) => ({
          shoppingListId: list.id,
          ingredientId: line.ingredientId,
          quantity: line.quantity !== null ? String(line.quantity) : null,
          unit: line.unit,
          order: index,
        })),
      );
    }

    return list;
  });
}

/**
 * SPEC §9.1 `POST /api/alexa/shopping-list` — "add an item by voice". The Alexa surface has no
 * per-user identity in v1 (no device pairing, per §9.2/DECISIONS.md), but `ShoppingList` is a
 * per-user table (SPEC §5). Rather than add schema for a circle-wide list, this targets whichever
 * list — across any circle member — was generated most recently, on the assumption that's
 * whatever's currently taped to the fridge. Returns null if no one has generated one yet.
 */
export async function getMostRecentShoppingListAcrossCircle(): Promise<{ id: string } | null> {
  const [list] = await db
    .select({ id: shoppingList.id })
    .from(shoppingList)
    .orderBy(desc(shoppingList.createdAt))
    .limit(1);
  return list ?? null;
}

export async function getLatestShoppingList(userId: string): Promise<ShoppingListView | null> {
  const [list] = await db
    .select({ id: shoppingList.id, createdAt: shoppingList.createdAt })
    .from(shoppingList)
    .where(eq(shoppingList.userId, userId))
    .orderBy(desc(shoppingList.createdAt))
    .limit(1);

  if (!list) return null;

  const itemRows = await db
    .select({
      id: shoppingListItem.id,
      ingredientId: shoppingListItem.ingredientId,
      ingredientName: ingredient.name,
      customName: shoppingListItem.customName,
      quantity: shoppingListItem.quantity,
      unit: shoppingListItem.unit,
      checked: shoppingListItem.checked,
      order: shoppingListItem.order,
    })
    .from(shoppingListItem)
    .leftJoin(ingredient, eq(shoppingListItem.ingredientId, ingredient.id))
    .where(eq(shoppingListItem.shoppingListId, list.id))
    .orderBy(shoppingListItem.order);

  return {
    id: list.id,
    createdAt: list.createdAt.toISOString(),
    items: itemRows.map((row) => ({
      id: row.id,
      ingredientId: row.ingredientId,
      name: row.ingredientName ?? row.customName ?? "Item",
      quantity: row.quantity !== null ? Number(row.quantity) : null,
      unit: row.unit,
      checked: row.checked,
      order: row.order,
    })),
  };
}

export async function setShoppingListItemChecked(itemId: string, checked: boolean): Promise<void> {
  await db.update(shoppingListItem).set({ checked }).where(eq(shoppingListItem.id, itemId));
}

export async function updateShoppingListItem(
  itemId: string,
  data: { quantity: number | null; unit: string | null },
): Promise<void> {
  await db
    .update(shoppingListItem)
    .set({ quantity: data.quantity !== null ? String(data.quantity) : null, unit: data.unit })
    .where(eq(shoppingListItem.id, itemId));
}

export async function addCustomShoppingListItem(
  shoppingListId: string,
  customName: string,
  quantity: number | null,
  unit: string | null,
): Promise<{ id: string }> {
  const existing = await db
    .select({ maxOrder: shoppingListItem.order })
    .from(shoppingListItem)
    .where(eq(shoppingListItem.shoppingListId, shoppingListId))
    .orderBy(desc(shoppingListItem.order))
    .limit(1);

  const [created] = await db
    .insert(shoppingListItem)
    .values({
      shoppingListId,
      customName,
      quantity: quantity !== null ? String(quantity) : null,
      unit,
      order: (existing[0]?.maxOrder ?? -1) + 1,
    })
    .returning({ id: shoppingListItem.id });

  return created;
}

export async function removeShoppingListItem(itemId: string): Promise<void> {
  await db.delete(shoppingListItem).where(eq(shoppingListItem.id, itemId));
}

export async function userOwnsShoppingList(userId: string, shoppingListId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: shoppingList.id })
    .from(shoppingList)
    .where(and(eq(shoppingList.id, shoppingListId), eq(shoppingList.userId, userId)))
    .limit(1);
  return !!row;
}

export async function userOwnsShoppingListItem(userId: string, itemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: shoppingListItem.id })
    .from(shoppingListItem)
    .innerJoin(shoppingList, eq(shoppingListItem.shoppingListId, shoppingList.id))
    .where(and(eq(shoppingListItem.id, itemId), eq(shoppingList.userId, userId)))
    .limit(1);
  return !!row;
}
