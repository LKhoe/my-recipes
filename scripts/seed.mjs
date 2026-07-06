import pg from "pg";

// Keep this list in sync with lib/db/seed.ts (SPEC §4.2's fixed category set, pt-BR). Duplicated
// rather than shared across a TS/JS boundary — this script runs as plain Node in the Docker
// entrypoint with no build step, so importing lib/db/seed.ts's TS wouldn't be reliable there.
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

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

for (const name of CATEGORIES) {
  await client.query('INSERT INTO category (id, name) VALUES (gen_random_uuid(), $1) ON CONFLICT (name) DO NOTHING', [name]);
}

await client.end();
console.log(`✅ Category seed complete (${CATEGORIES.length} categories).`);
