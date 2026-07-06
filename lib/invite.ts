import { randomBytes } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { inviteCode } from "@/lib/db/schema";

export const PENDING_INVITE_COOKIE = "pending_invite_code";

// Short-lived: only needs to survive the redirect round trip to Google and back.
export const PENDING_INVITE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export function generateInviteCode(): string {
  return randomBytes(5).toString("hex");
}

export async function isInviteCodeRedeemable(code: string): Promise<boolean> {
  if (!code) return false;
  const [row] = await db
    .select({ id: inviteCode.id })
    .from(inviteCode)
    .where(and(eq(inviteCode.code, code), isNull(inviteCode.usedAt)))
    .limit(1);
  return !!row;
}

export async function redeemInviteCode(code: string, userId: string): Promise<boolean> {
  const result = await db
    .update(inviteCode)
    .set({ usedByUserId: userId, usedAt: new Date() })
    .where(and(eq(inviteCode.code, code), isNull(inviteCode.usedAt)))
    .returning({ id: inviteCode.id });
  return result.length > 0;
}

/** Parses the invite code carried by the pending-invite cookie out of a raw `Cookie` header. */
export function extractPendingInviteCode(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === PENDING_INVITE_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
