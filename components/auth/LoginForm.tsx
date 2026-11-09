"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { googleErrorMessage, isInviteRequiredError } from "@/lib/auth-errors";
import { GoogleButton } from "@/components/auth/GoogleButton";

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  // Set by Better Auth when Google sign-in fails (errorCallbackURL below)
  const googleError = searchParams.get("error");
  const noAccount = isInviteRequiredError(googleError);

  const [error, setError] = useState<string | null>(
    googleError && !noAccount ? googleErrorMessage(googleError) : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);

    const { error: signInError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: redirect,
      // A Google account with no account here is a sign-up, which needs an invite: come back
      // to this page (Better Auth appends ?error=…) instead of a generic error page.
      errorCallbackURL: `/login?redirect=${encodeURIComponent(redirect)}`,
    });

    if (signInError) {
      setError(signInError.message ?? "Não foi possível entrar com o Google.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {noAccount && (
        <div role="alert" className="rounded-lg border border-accent bg-accent/30 p-3 text-sm">
          <p className="font-medium text-foreground">Ainda não há uma conta com esse Google.</p>
          <p className="mt-1 text-muted-foreground">
            Para entrar pela primeira vez você precisa de um código de convite.{" "}
            <a href="/signup" className="font-medium text-primary hover:underline">
              Criar conta com convite
            </a>
          </p>
        </div>
      )}

      <GoogleButton onClick={handleGoogleLogin} loading={loading} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Recebeu um convite?{" "}
        <a href="/signup" className="font-medium text-primary hover:underline">
          Criar sua conta
        </a>
      </p>
    </div>
  );
}
