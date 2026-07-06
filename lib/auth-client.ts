import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? { baseURL: process.env.NEXT_PUBLIC_APP_URL }
    : {}),
});

export const { signIn, signUp, signOut, useSession, getSession, resetPassword } = authClient;
