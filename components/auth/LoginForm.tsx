"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    });

    if (signInError) {
      setError(signInError.message ?? "Não foi possível entrar com o Google.");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading !== null} className="mt-1">
          {loading === "email" ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        ou
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={loading !== null}
        onClick={handleGoogleLogin}
      >
        {loading === "google" ? "Redirecionando…" : "Continuar com Google"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Novo por aqui?{" "}
        <a href="/signup" className="font-medium text-primary hover:underline">
          Você vai precisar de um código de convite
        </a>
      </p>
    </div>
  );
}
