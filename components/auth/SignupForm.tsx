"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Loader2, Ticket } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { googleErrorMessage, isInviteRequiredError } from "@/lib/auth-errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/auth/GoogleButton";

/**
 * Checks the code and stores it in the short-lived pending-invite cookie that the sign-up hook
 * (lib/auth.ts) reads — for both email sign-up and the Google redirect round trip. Called again
 * right before each sign-up attempt, since the cookie only lasts 10 minutes.
 */
async function acceptInvite(code: string): Promise<string | null> {
  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.error ?? "Código de convite inválido ou já utilizado.";
}

function Steps({ current }: { current: 1 | 2 }) {
  const steps = ["Convite", "Sua conta"];
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                done && "border-success bg-success text-success-foreground",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : n}
            </span>
            <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
            {n < steps.length && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkCode = searchParams.get("convite")?.trim().toLowerCase() ?? "";
  const googleError = searchParams.get("error");

  const [inviteCode, setInviteCode] = useState(linkCode);
  // An invite link (/signup?convite=CODE) is checked right away and skips to step 2 — unless
  // Google just sent the user back with an error, which they should read first.
  const autoCheck = Boolean(linkCode) && !googleError;
  const [accepted, setAccepted] = useState(false);
  const [checking, setChecking] = useState(autoCheck);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    googleError
      ? isInviteRequiredError(googleError)
        ? "Seu convite expirou ou já foi usado. Confira o código e tente de novo."
        : googleErrorMessage(googleError)
      : null,
  );
  const [loading, setLoading] = useState<"email" | "google" | null>(null);

  useEffect(() => {
    if (!autoCheck) return;
    let cancelled = false;
    acceptInvite(linkCode).then((inviteError) => {
      if (cancelled) return;
      setChecking(false);
      if (inviteError) setError(inviteError);
      else setAccepted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [autoCheck, linkCode]);

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode) return;
    setError(null);
    setChecking(true);
    const inviteError = await acceptInvite(inviteCode);
    setChecking(false);
    if (inviteError) setError(inviteError);
    else setAccepted(true);
  }

  async function handleGoogle() {
    setError(null);
    setLoading("google");
    const inviteError = await acceptInvite(inviteCode);
    if (inviteError) {
      setError(inviteError);
      setAccepted(false);
      setLoading(null);
      return;
    }
    const { error: signInError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/recipes",
      // Better Auth appends ?error=… — the code comes back so the user doesn't retype it
      errorCallbackURL: `/signup?convite=${encodeURIComponent(inviteCode)}`,
    });
    if (signInError) {
      setError(signInError.message ?? "Não foi possível continuar com o Google.");
      setLoading(null);
    }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("email");
    const inviteError = await acceptInvite(inviteCode);
    if (inviteError) {
      setError(inviteError);
      setAccepted(false);
      setLoading(null);
      return;
    }
    const { error: signUpError } = await authClient.signUp.email({ name, email, password });
    if (signUpError) {
      setError(signUpError.message ?? "Não foi possível criar a conta.");
      setLoading(null);
      return;
    }
    router.push("/recipes");
    router.refresh();
  }

  if (!accepted) {
    return (
      <div key="step-1" className="animate-in fade-in-0 slide-in-from-left-2 duration-300">
        <Steps current={1} />
        <h2 className="font-display text-display-sm text-foreground">Criar sua conta</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          O Minhas Receitas é só para convidados. Digite o código que você recebeu de alguém do
          círculo.
        </p>

        <form onSubmit={handleInviteSubmit} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inviteCode">Código de convite</Label>
            <div className="relative">
              <Ticket className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="inviteCode"
                required
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.trim().toLowerCase())}
                placeholder="ex.: a1b2c3d4e5"
                aria-invalid={error ? true : undefined}
                className="h-11 pl-9 font-mono tracking-wider"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={checking || !inviteCode} className="w-full">
            {checking ? <Loader2 className="size-4 animate-spin" /> : null}
            {checking ? "Verificando…" : "Continuar"}
            {!checking && <ArrowRight className="size-4" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem uma conta?{" "}
          <a href="/login" className="font-medium text-primary hover:underline">
            Entrar
          </a>
        </p>
      </div>
    );
  }

  return (
    <div key="step-2" className="animate-in fade-in-0 slide-in-from-right-2 duration-300">
      <Steps current={2} />

      <div className="flex items-center justify-between gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-foreground">
          <Check className="size-4 shrink-0 text-success" />
          <span className="truncate">
            Convite aceito <span className="font-mono text-muted-foreground">{inviteCode}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            setAccepted(false);
            setError(null);
          }}
          className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Trocar
        </button>
      </div>

      <h2 className="mt-5 font-display text-display-sm text-foreground">Como você quer entrar?</h2>

      <div className="mt-4 flex flex-col gap-2">
        <GoogleButton onClick={handleGoogle} loading={loading === "google"} disabled={loading !== null} />
        <p className="text-center text-xs text-muted-foreground">O jeito mais rápido: sem senha para lembrar.</p>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        ou crie uma senha
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleEmailSignup} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
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
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
        </div>
        <Button type="submit" variant="secondary" disabled={loading !== null} className="w-full">
          {loading === "email" ? "Criando conta…" : "Criar conta com e-mail"}
        </Button>
      </form>
    </div>
  );
}
