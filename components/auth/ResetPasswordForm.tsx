"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Este link de redefinição está sem o token.");
      return;
    }
    setError(null);
    setLoading(true);

    const { error: resetError } = await authClient.resetPassword({ newPassword, token });

    if (resetError) {
      setError(resetError.message ?? "Não foi possível redefinir a senha.");
      setLoading(false);
      return;
    }

    router.push("/login");
  }

  if (!token) {
    return (
      <p className="text-sm text-destructive">
        Este link de redefinição é inválido ou expirou. Solicite um novo pela página de login.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">Nova senha</Label>
        <Input
          id="newPassword"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Redefinindo…" : "Redefinir senha"}
      </Button>
    </form>
  );
}
