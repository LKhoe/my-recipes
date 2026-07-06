import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerateInviteButton } from "@/components/settings/GenerateInviteButton";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Configurações</h1>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-display-sm text-foreground">Convidar alguém</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gere um código de uso único para um novo membro do círculo se cadastrar.
        </p>
        <div className="mt-4">
          <GenerateInviteButton />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-display-sm text-foreground">Backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Baixe um snapshot completo e restaurável do banco de dados e das fotos das receitas.
        </p>
        <Button asChild className="mt-4">
          <a href="/api/backup" download>
            <Download className="size-4" /> Baixar backup
          </a>
        </Button>
      </section>
    </div>
  );
}
