"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function redeemInviteIntent(code: string): Promise<string | null> {
  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.error ?? "Invalid or already-used invite code.";
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"email" | "google" | null>(null);

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("email");

    const inviteError = await redeemInviteIntent(inviteCode);
    if (inviteError) {
      setError(inviteError);
      setLoading(null);
      return;
    }

    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message ?? "Could not create account.");
      setLoading(null);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogleSignup() {
    setError(null);
    setLoading("google");

    const inviteError = await redeemInviteIntent(inviteCode);
    if (inviteError) {
      setError(inviteError);
      setLoading(null);
      return;
    }

    await authClient.signIn.social({ provider: "google", callbackURL: "/" });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleEmailSignup} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inviteCode">Invite code</Label>
          <Input
            id="inviteCode"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.trim())}
            placeholder="From whoever invited you"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading !== null} className="mt-1">
          {loading === "email" ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={loading !== null}
        onClick={handleGoogleSignup}
      >
        {loading === "google" ? "Redirecting…" : "Continue with Google"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a href="/login" className="font-medium text-primary hover:underline">
          Log in
        </a>
      </p>
    </div>
  );
}
