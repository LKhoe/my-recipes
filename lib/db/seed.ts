import { db } from "@/lib/db";
import { category } from "@/lib/db/schema";

// Fixed category set (SPEC §4.2), in Brazilian Portuguese. Idempotent — safe to run on every deploy.
const CATEGORIES = [
  "Café da Manhã",
  "Brunch",
  "Entrada",
  "Prato Principal",
  "Acompanhamento",
  "Salada",
  "Sopa",
  "Sobremesa",
  "Lanche",
  "Pão",
  "Molhos e Condimentos",
  "Bebida",
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
