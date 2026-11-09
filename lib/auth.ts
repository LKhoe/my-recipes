import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import {
  extractPendingInviteCode,
  isInviteCodeRedeemable,
  redeemInviteCode,
} from "@/lib/invite";
import { INVITE_REQUIRED_MESSAGE } from "@/lib/auth-errors";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  // Google is the only way in (DECISIONS.md "S8"). Explicitly off: the email/password sign-in and
  // sign-up routes answer 400, and with no `sendResetPassword` the reset routes are inert too.
  emailAndPassword: {
    enabled: false,
  },
  // Belt and braces for the password routes; `account` rows of old password users are left alone.
  disabledPaths: [
    "/sign-in/email",
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/reset-password/:token",
    "/change-password",
    "/set-password",
  ],

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
      // Members who signed up with a password have an unverified email (there was never an email
      // provider), so the default `true` would refuse to link their Google account to them
      // ("account_not_linked"). That link is how they keep getting in now that passwords are off.
      // Google asserts the email, and new sign-ups need an invite. See DECISIONS.md "S8".
      requireLocalEmailVerified: false,
    },
  },

  // SPEC §3: closed circle — every new account (Google is the only sign-up method) must carry a valid,
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
              message: INVITE_REQUIRED_MESSAGE,
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
