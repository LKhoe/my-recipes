"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, Plus, Sparkles, ListPlus, Split } from "lucide-react";
import { groupAlternatives } from "@/lib/ingredient-alternatives";
import { groupIngredientSections } from "@/lib/ingredient-groups";
import { cn } from "@/lib/utils";
import type { RecipeIngredientInput } from "@/types";

function emptyRow(group: string | null): RecipeIngredientInput {
  return { ingredientName: "", quantity: null, unit: null, note: null, group };
}

function IngredientRow({
  row,
  onChange,
  onRemove,
  onAddAlternative,
}: {
  row: RecipeIngredientInput;
  onChange: (patch: Partial<RecipeIngredientInput>) => void;
  onRemove: () => void;
  /** Only on a main ingredient: adds an "ou" option below it. */
  onAddAlternative?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2",
        row.alternative && "ml-6 border-dashed bg-transparent",
      )}
    >
      {row.alternative && (
        <span className="w-6 text-center text-xs font-medium uppercase text-muted-foreground" aria-label="ou">
          ou
        </span>
      )}
      <Input
        className="w-20"
        placeholder="Qtd"
        inputMode="decimal"
        value={row.quantity ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange({ quantity: raw === "" ? null : Number(raw) });
        }}
      />
      <Input
        className="w-24"
        placeholder="Unidade"
        value={row.unit ?? ""}
        onChange={(e) => onChange({ unit: e.target.value || null })}
      />
      <Input
        className="min-w-40 flex-1"
        placeholder={row.alternative ? "Alternativa" : "Ingrediente"}
        required
        value={row.ingredientName}
        onChange={(e) => onChange({ ingredientName: e.target.value })}
      />
      <Input
        className="min-w-32 flex-1"
        placeholder="Observação (opcional)"
        value={row.note ?? ""}
        onChange={(e) => onChange({ note: e.target.value || null })}
      />
      {row.inferred && (
        <span
          title="Quantidade estimada durante a importação — confira antes de salvar"
          className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
        >
          <Sparkles className="size-3" /> estimado
        </span>
      )}
      {onAddAlternative && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Adicionar alternativa (ou…)"
          title="Adicionar alternativa (ex.: manteiga ou margarina)"
          onClick={onAddAlternative}
        >
          <Split className="size-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={row.alternative ? "Remover alternativa" : "Remover ingrediente"}
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Edits the flat ingredient list as sections: a run of consecutive rows sharing a `group` label
 * shows under one editable heading (lib/ingredient-groups.ts). Rows with no label sit outside any
 * section, so a recipe without sections edits exactly as before. While a heading is being typed
 * its label may be "" — it still counts as a section here; the API turns blank labels into null.
 */
export function IngredientsEditor({
  value,
  onChange,
}: {
  value: RecipeIngredientInput[];
  onChange: (next: RecipeIngredientInput[]) => void;
}) {
  const sections = groupIngredientSections(value);
  const lastSection = sections.at(-1);

  function updateRow(index: number, patch: Partial<RecipeIngredientInput>) {
    const next = value.slice();
    next[index] = { ...next[index], ...patch, inferred: patch.inferred ?? false };
    onChange(next);
  }

  function removeRow(index: number) {
    // Removing a main ingredient promotes its first "ou" option to take its place.
    const promoteNext = !value[index].alternative && value[index + 1]?.alternative;
    onChange(
      value
        .map((row, i) => (promoteNext && i === index + 1 ? { ...row, alternative: false } : row))
        .filter((_, i) => i !== index),
    );
  }

  /** A new option after the ingredient's last one, starting with the same amount. */
  function insertAlternative(at: number, primary: RecipeIngredientInput) {
    const row = { ...emptyRow(primary.group ?? null), quantity: primary.quantity, unit: primary.unit, alternative: true };
    onChange([...value.slice(0, at), row, ...value.slice(at)]);
  }

  function renderRows(rows: { item: RecipeIngredientInput; index: number }[]) {
    return groupAlternatives(rows).map(({ primary, alternatives }) => {
      const afterLast = (alternatives.at(-1) ?? primary).index + 1;
      return (
        <div key={primary.index} className="flex flex-col gap-2">
          <IngredientRow
            row={{ ...primary.item, alternative: false }}
            onChange={(patch) => updateRow(primary.index, patch)}
            onRemove={() => removeRow(primary.index)}
            onAddAlternative={() => insertAlternative(afterLast, primary.item)}
          />
          {alternatives.map(({ item, index }) => (
            <IngredientRow
              key={index}
              row={item}
              onChange={(patch) => updateRow(index, patch)}
              onRemove={() => removeRow(index)}
            />
          ))}
        </div>
      );
    });
  }

  function insertRow(at: number, group: string | null) {
    onChange([...value.slice(0, at), emptyRow(group), ...value.slice(at)]);
  }

  /** Relabels every row of one section (rows are addressed by their flat-list indexes). */
  function setSectionGroup(indexes: number[], group: string | null) {
    const inSection = new Set(indexes);
    onChange(value.map((row, i) => (inSection.has(i) ? { ...row, group } : row)));
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Ingredientes</Label>
      <div className="flex flex-col gap-2">
        {sections.map((section, sectionIndex) => {
          const indexes = section.rows.map((r) => r.index);
          const endIndex = indexes[indexes.length - 1] + 1;

          if (section.group === null) {
            return <div key={`rows-${indexes[0]}`} className="contents">{renderRows(section.rows)}</div>;
          }

          // Removing a heading keeps its ingredients: they join the section above (or none).
          const groupAbove = sectionIndex > 0 ? sections[sectionIndex - 1].group : null;
          return (
            <fieldset
              key={`section-${indexes[0]}`}
              className="mt-2 flex flex-col gap-2 border-l-2 border-primary/40 pl-3 first:mt-0"
            >
              <legend className="sr-only">Seção {section.group || "sem nome"}</legend>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 max-w-64 font-display text-base font-medium"
                  placeholder="Nome da seção (ex.: Massa, Recheio)"
                  aria-label="Nome da seção"
                  autoFocus={section.group === ""}
                  value={section.group}
                  onChange={(e) => setSectionGroup(indexes, e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  title="Os ingredientes continuam na receita"
                  onClick={() => setSectionGroup(indexes, groupAbove)}
                >
                  <X className="size-4" /> Remover seção
                </Button>
              </div>
              {renderRows(section.rows)}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => insertRow(endIndex, section.group)}
              >
                <Plus className="size-4" /> Adicionar ingrediente
              </Button>
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {(lastSection === undefined || lastSection.group === null) && (
          <Button type="button" variant="outline" size="sm" onClick={() => insertRow(value.length, null)}>
            <Plus className="size-4" /> Adicionar ingrediente
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          // A second unnamed section right after an unnamed one would merge into it.
          disabled={lastSection?.group === ""}
          onClick={() => insertRow(value.length, "")}
        >
          <ListPlus className="size-4" /> Adicionar seção
        </Button>
      </div>
    </div>
  );
}
