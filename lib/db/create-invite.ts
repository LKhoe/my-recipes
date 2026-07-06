import { db } from "@/lib/db";
import { inviteCode } from "@/lib/db/schema";
import { generateInviteCode } from "@/lib/invite";

// Bootstraps an invite code with no creator, for the very first sign-up (before any user
// exists). Run with: npx tsx lib/db/create-invite.ts
async function main() {
  const code = generateInviteCode();
  await db.insert(inviteCode).values({ code });
  console.log(`Invite code: ${code}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create invite code:", err);
  process.exit(1);
});
