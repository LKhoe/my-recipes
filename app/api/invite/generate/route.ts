import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { inviteCode } from "@/lib/db/schema";
import { generateInviteCode } from "@/lib/invite";

// Any authenticated circle member can mint a single-use invite code for someone new (SPEC §3).
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = generateInviteCode();
  await db.insert(inviteCode).values({ code, createdByUserId: session.user.id });

  return NextResponse.json({ code });
}
