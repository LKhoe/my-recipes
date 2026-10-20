"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown on an imported recipe until its author confirms the draft was checked. Only the author
 * gets the button; everyone else just sees that it may still hold import mistakes.
 */
export function ReviewPendingNotice({
  recipeId,
  canReview,
  authorName,
}: {
  recipeId: string;
  canReview: boolean;
  authorName: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function markReviewed() {
    setSaving(true);
    const res = await fetch(`/api/recipes/${recipeId}/review`, { method: "POST" });
    if (res.ok) {
      toast.success("Receita marcada como revisada.");
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Não foi possível marcar a receita como revisada.");
      setSaving(false);
    }
  }

  return (
    <div
      role="status"
      className="mt-4 flex flex-col gap-3 rounded-xl border border-accent bg-accent/30 p-3 text-sm sm:flex-row sm:items-center"
    >
      <TriangleAlert className="hidden size-5 shrink-0 text-accent-foreground sm:block" />
      <p className="flex-1 text-accent-foreground">
        <span className="font-medium">Pendente de revisão.</span>{" "}
        {canReview
          ? "Esta receita foi importada automaticamente. Confira ingredientes e modo de preparo e marque-a como revisada."
          : `Importada automaticamente e ainda não conferida${authorName ? ` por ${authorName}` : ""}: pode ter erros.`}
      </p>
      {canReview && (
        <Button size="sm" className="self-start sm:self-auto" disabled={saving} onClick={markReviewed}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Marcar como revisada
        </Button>
      )}
    </div>
  );
}
