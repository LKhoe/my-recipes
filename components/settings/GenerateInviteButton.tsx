"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Share2 } from "lucide-react";

export function GenerateInviteButton() {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const res = await fetch("/api/invite/generate", { method: "POST" });
    setLoading(false);
    if (res.ok) {
      const body = await res.json();
      setCode(body.code);
    } else {
      toast.error("Não foi possível gerar um código de convite");
    }
  }

  // The link opens sign-up with the code already checked (SignupForm reads ?convite=)
  const link = code ? `${window.location.origin}/signup?convite=${code}` : "";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Convite para o Minhas Receitas",
        text: "Entre no nosso livro de receitas:",
        url: link,
      });
    } catch {
      // dismissed by the user — nothing to do
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={handleGenerate} disabled={loading} className="self-start">
        {loading ? "Gerando…" : code ? "Gerar outro convite" : "Gerar convite"}
      </Button>
      {code && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Link de convite (o mais fácil)</span>
            <div className="flex items-center gap-2">
              <Input readOnly value={link} className="min-w-0 flex-1 text-xs" onFocus={(e) => e.target.select()} />
              <Button type="button" size="sm" onClick={() => copy(link, "Link")}>
                <Copy className="size-4" /> Copiar
              </Button>
              {canShare && (
                <Button type="button" size="icon-sm" variant="outline" onClick={share} aria-label="Compartilhar convite">
                  <Share2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            ou o código:
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-sm text-foreground">{code}</code>
            <button type="button" onClick={() => copy(code, "Código")} className="hover:text-foreground hover:underline">
              copiar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Vale para uma pessoa, uma única vez.</p>
        </div>
      )}
    </div>
  );
}
