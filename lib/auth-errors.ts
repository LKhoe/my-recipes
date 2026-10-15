// Shared between lib/auth.ts (server) and the login/signup forms (client): keep it free of
// server-only imports.

/** What the sign-up hook rejects with when there's no valid invite (lib/auth.ts). */
export const INVITE_REQUIRED_MESSAGE = "É necessário um código de convite válido para criar uma conta.";

/**
 * After a failed Google sign-in, Better Auth redirects to our `errorCallbackURL` with
 * `?error=<code>`. A refused sign-up arrives either as the hook's code or as its message with
 * spaces turned into underscores (better-auth's oauth callback, `result.error.split(" ")`).
 */
export function isInviteRequiredError(error: string | null): boolean {
  if (!error) return false;
  return error === "INVALID_INVITE_CODE" || error.replaceAll("_", " ") === INVITE_REQUIRED_MESSAGE;
}

/** Friendly text for any other `?error=` Better Auth sends back from Google sign-in. */
export function googleErrorMessage(error: string): string {
  if (error === "access_denied") return "Você cancelou o acesso pelo Google.";
  return "Não foi possível entrar com o Google. Tente de novo.";
}
