"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { googleErrorMessage, isInviteRequiredError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/auth/GoogleButton";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  // Set by Better Auth when Google sign-in fails (errorCallbackURL below)
  const googleError = searchParams.get("error");
  const noAccount = isInviteRequiredError(googleError);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    googleError && !noAccount ? googleErrorMessage(googleError) : null,
  );
  const [loading, setLoading] = useState<"email" | "google" | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("email");

    const { error: signInError } = await authClient.signIn.email({ email, password });

    if (signInError) {
      setError(signInError.message ?? "Não foi possível entrar.");
      setLoading(null);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setError(null);
    setLoading("google");

    const { error: signInError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: redirect,
      // A Google account with no account here is a sign-up, which needs an invite: come back
      // to this page (Better Auth appends ?error=…) instead of a generic error page.
      errorCallbackURL: `/login?redirect=${encodeURIComponent(redirect)}`,
    });

    if (signInError) {
      setError(signInError.message ?? "Não foi possível entrar com o Google.");
      setLoading(null);
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

      <GoogleButton onClick={handleGoogleLogin} loading={loading === "google"} disabled={loading !== null} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        ou com e-mail
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <a href="/forgot-password" className="text-xs text-muted-foreground hover:underline">
              Esqueceu a senha?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading !== null} className="mt-1">
          {loading === "email" ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Recebeu um convite?{" "}
        <a href="/signup" className="font-medium text-primary hover:underline">
          Criar sua conta
        </a>
      </p>
    </div>
  );
}
