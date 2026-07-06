import { db } from "@/lib/db";
import { category } from "@/lib/db/schema";

// Fixed category set (SPEC §4.2). Idempotent — safe to run on every deploy.
const CATEGORIES = [
  "Breakfast",
  "Brunch",
  "Appetizer",
  "Main",
  "Side",
  "Salad",
  "Soup",
  "Dessert",
  "Snack",
  "Bread",
  "Sauce & Condiment",
  "Beverage",
];

async function seed() {
  console.log("Seeding categories...");

  await db
    .insert(category)
    .values(CATEGORIES.map((name) => ({ name })))
    .onConflictDoNothing({ target: category.name });

  console.log(`Seed complete (${CATEGORIES.length} categories).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
