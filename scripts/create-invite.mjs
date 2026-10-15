import { randomBytes, randomUUID } from "crypto";
import pg from "pg";

// Bootstraps an invite code with no creator, for the very first sign-up (before any user exists).
// Plain .mjs (no tsx) so it also runs inside the production image. Keep the code format in sync
// with generateInviteCode() in lib/invite.ts.
//
//   npm run db:invite                                                   local dev
//   DOCKER_CONTEXT=umbrel docker exec my-recipes node scripts/create-invite.mjs   on the Pi
const code = randomBytes(5).toString("hex");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("INSERT INTO invite_code (id, code) VALUES ($1, $2)", [randomUUID(), code]);
await client.end();

console.log(`Invite code: ${code}`);
