import { parseIso8601DurationToMinutes } from "@/lib/services/duration";
import { normalizeGroupLabel } from "@/lib/ingredient-groups";
import { parseIngredientLine } from "@/lib/services/ingredient-parser";
import type { RecipeDraft, RecipeStep } from "@/types";

type JsonLdNode = Record<string, unknown>;

function hasRecipeType(node: JsonLdNode): boolean {
  const type = node["@type"];
  if (typeof type === "string") return type === "Recipe";
  if (Array.isArray(type)) return type.includes("Recipe");
  return false;
}

/** JSON-LD recipes can be a bare object, an array of objects, or wrapped in an `@graph`. */
function findRecipeNode(parsed: unknown): JsonLdNode | null {
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }

  if (parsed && typeof parsed === "object") {
    const node = parsed as JsonLdNode;
    if (hasRecipeType(node)) return node;
    if (Array.isArray(node["@graph"])) return findRecipeNode(node["@graph"]);
  }

  return null;
}

export function extractJsonLdRecipeNodes(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const node = findRecipeNode(parsed);
      if (node) nodes.push(node);
    } catch {
      // Malformed JSON-LD block — skip it, keep scanning others.
    }
  }

  return nodes;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return firstString(value[0]);
  if (value && typeof value === "object") {
    const obj = value as JsonLdNode;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.contentUrl === "string") return obj.contentUrl;
    if (typeof obj.embedUrl === "string") return obj.embedUrl;
  }
  return null;
}

function parseServings(recipeYield: unknown): number | null {
  const str = firstString(recipeYield);
  if (!str) return null;
  const match = str.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function flattenInstructions(instructions: unknown): RecipeStep[] {
  const steps: RecipeStep[] = [];

  function visit(node: unknown) {
    if (typeof node === "string") {
      // A single blob sometimes arrives as newline-separated sentences.
      const lines = node.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) steps.push({ text: line });
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as JsonLdNode;
      const type = obj["@type"];
      if (type === "HowToSection" && Array.isArray(obj.itemListElement)) {
        visit(obj.itemListElement);
        return;
      }
      if (typeof obj.text === "string") {
        steps.push({ text: obj.text.trim() });
        return;
      }
      if (typeof obj.name === "string") {
        steps.push({ text: obj.name.trim() });
      }
    }
  }

  visit(instructions);
  return steps.filter((s) => s.text.length > 0);
}

export function jsonLdNodeToDraft(node: JsonLdNode, sourceUrl: string): RecipeDraft | null {
  const title = firstString(node.name);
  if (!title) return null;

  const rawIngredients = Array.isArray(node.recipeIngredient)
    ? (node.recipeIngredient as unknown[]).filter((i): i is string => typeof i === "string")
    : [];
  const steps = flattenInstructions(node.recipeInstructions);

  if (rawIngredients.length === 0 && steps.length === 0) return null;

  // schema.org's recipeIngredient is a flat list of strings with no sections, but many sites put
  // a part's heading in it as its own line ("Para o molho:"). Such a line names the section of the
  // lines after it instead of becoming an ingredient.
  let group: string | null = null;
  const ingredients = rawIngredients.flatMap((line) => {
    const heading = line.trim().match(/^([^\d]{1,50}):$/);
    if (heading) {
      group = normalizeGroupLabel(heading[1]);
      return [];
    }
    const parsed = parseIngredientLine(line);
    return [
      {
        ingredientName: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        note: parsed.note,
        group,
        inferred: false,
      },
    ];
  });

  return {
    recipeFound: true,
    title,
    description: firstString(node.description),
    servings: parseServings(node.recipeYield),
    prepTime: parseIso8601DurationToMinutes(firstString(node.prepTime)),
    cookTime: parseIso8601DurationToMinutes(firstString(node.cookTime)),
    steps,
    ingredients,
    sourceUrl,
    videoUrl: firstString(node.video),
    imageUrl: firstString(node.image),
  };
}

export function extractRecipeFromJsonLd(html: string, sourceUrl: string): RecipeDraft | null {
  const nodes = extractJsonLdRecipeNodes(html);
  for (const node of nodes) {
    const draft = jsonLdNodeToDraft(node, sourceUrl);
    if (draft) return draft;
  }
  return null;
}
