"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ExistingRecipe = { id: string; title: string; authorName: string | null };

/**
 * Asks before importing a link that is already a recipe (a single link, or videos picked from a
 * playlist), listing those recipes so the user can open them instead.
 */
export function AlreadyImportedDialog({
  open,
  recipes,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  recipes: ExistingRecipe[];
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Já importada</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                target="_blank"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-medium text-foreground">{recipe.title}</span>
                  {recipe.authorName && (
                    <span className="block text-xs text-muted-foreground">por {recipe.authorName}</span>
                  )}
                </span>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-label="Abre em outra aba" />
              </Link>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
