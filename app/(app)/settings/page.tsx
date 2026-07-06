import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerateInviteButton } from "@/components/settings/GenerateInviteButton";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-display-lg text-foreground">Settings</h1>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-display-sm text-foreground">Invite someone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate a single-use code for a new circle member to sign up with.
        </p>
        <div className="mt-4">
          <GenerateInviteButton />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-display-sm text-foreground">Backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a complete, restorable snapshot of the database and recipe photos.
        </p>
        <Button asChild className="mt-4">
          <a href="/api/backup" download>
            <Download className="size-4" /> Download backup
          </a>
        </Button>
      </section>
    </div>
  );
}
