import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import {
  extractPendingInviteCode,
  isInviteCodeRedeemable,
  redeemInviteCode,
} from "@/lib/invite";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    // No transactional email provider in v1 (SPEC is silent on one) — log the link so an
    // admin can relay it manually. See DECISIONS.md.
    sendResetPassword: async ({ user, url }) => {
      console.log(`[auth] Password reset requested for ${user.email}: ${url}`);
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      // Emails are never verified here (no email provider), so the default `true` blocked every
      // email/password member from linking Google ("account_not_linked"). Invite-only sign-up is
      // the safeguard against pre-registering someone else's email. See DECISIONS.md.
      requireLocalEmailVerified: false,
    },
  },

  // SPEC §3: closed circle — every new account (either sign-up method) must carry a valid,
  // unused invite code. The code travels as a short-lived cookie set by POST /api/invite
  // before the sign-up request/OAuth redirect fires, since it needs to survive the Google
  // OAuth round trip where we don't control the callback request body.
  databaseHooks: {
    user: {
      create: {
        before: async (_user, context) => {
          const cookieHeader = context?.headers?.get("cookie");
          const code = extractPendingInviteCode(cookieHeader);

          if (!code || !(await isInviteCodeRedeemable(code))) {
            throw new APIError("BAD_REQUEST", {
              message: "É necessário um código de convite válido para criar uma conta.",
              code: "INVALID_INVITE_CODE",
            });
          }
        },
        after: async (user, context) => {
          const cookieHeader = context?.headers?.get("cookie");
          const code = extractPendingInviteCode(cookieHeader);
          if (code) {
            const redeemed = await redeemInviteCode(code, user.id);
            // Can happen if two sign-ups race on the same invite code between the `before` hook's
            // check and this `after` hook's write — `before` only confirms the code was
            // redeemable at that instant, not that it still is by the time this runs. The user
            // account already exists at this point (this hook fires after creation), so there's
            // nothing to roll back; surfacing it loudly is what makes a double-use visible rather
            // than silently letting a second account in on a code meant for one signup.
            if (!redeemed) {
              console.warn(
                `[auth] Invite code "${code}" could not be redeemed for user ${user.id} — ` +
                  "likely already used by a concurrent sign-up.",
              );
            }
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
