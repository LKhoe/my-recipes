// The Echo Show screens (APL documents), built as plain objects. Laid out for the Show 15's
// 1920×1080 landscape screen, with smaller type below 1280dp wide (Show 8/10). Text always goes in
// through the datasource (`${data.…}`), never into the document itself, so a "${" in a recipe
// can't be read as an APL expression.
import { imageSrc, isExternalImageUrl, thumbnailSrc } from "@/lib/image-url";

export const APL_INTERFACE = "Alexa.Presentation.APL";

const COLORS = {
  background: "#261C17",
  surface: "#33271F",
  foreground: "#F6EFE6",
  muted: "#B8A99A",
  primary: "#E07A55",
  primaryForeground: "#261C17",
};

// The skill stays on screen while someone cooks: the device drops back to its home screen only
// after this long without a request (each "Alexa, próximo" resets it).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** A recipe photo as an absolute HTTPS URL the device can fetch, or "" for none. */
export function absoluteImageUrl(path: string | null | undefined, baseUrl = process.env.NEXT_PUBLIC_APP_URL): string {
  if (!path) return "";
  if (isExternalImageUrl(path)) return imageSrc(path);
  if (!baseUrl) return "";
  return `${baseUrl.replace(/\/$/, "")}${thumbnailSrc(path)}`;
}

type Component = Record<string, unknown>;

function text(value: string, style: Record<string, unknown> = {}): Component {
  return { type: "Text", text: value, color: COLORS.foreground, fontSize: "@bodySize", ...style };
}

function button(label: string, event: unknown[], primary = true): Component {
  return {
    type: "TouchWrapper",
    onPress: [{ type: "SendEvent", arguments: event }],
    item: {
      type: "Frame",
      backgroundColor: primary ? COLORS.primary : COLORS.surface,
      borderRadius: "40dp",
      paddingLeft: "40dp",
      paddingRight: "40dp",
      paddingTop: "18dp",
      paddingBottom: "18dp",
      item: text(label, {
        color: primary ? COLORS.primaryForeground : COLORS.foreground,
        fontWeight: "700",
        fontSize: "@smallSize",
        textAlign: "center",
      }),
    },
  };
}

function document(mainItems: Component[]): Component {
  return {
    type: "APL",
    version: "2023.2",
    theme: "dark",
    settings: { idleTimeout: IDLE_TIMEOUT_MS },
    resources: [
      {
        dimensions: { titleSize: "52dp", bodySize: "32dp", stepSize: "60dp", smallSize: "26dp", pad: "64dp" },
      },
      {
        when: "${viewport.width < 1280}",
        dimensions: { titleSize: "36dp", bodySize: "24dp", stepSize: "38dp", smallSize: "20dp", pad: "36dp" },
      },
    ],
    mainTemplate: {
      parameters: ["data"],
      items: [
        {
          type: "Container",
          width: "100vw",
          height: "100vh",
          backgroundColor: COLORS.background,
          paddingLeft: "@pad",
          paddingRight: "@pad",
          paddingTop: "@pad",
          paddingBottom: "@pad",
          items: mainItems,
        },
      ],
    },
  };
}

/** Substitution answer, shown beside the ingredients or the current step. */
function callout(): Component {
  return {
    type: "Container",
    when: "${data.hasCallout}",
    backgroundColor: COLORS.surface,
    borderRadius: "24dp",
    paddingLeft: "32dp",
    paddingRight: "32dp",
    paddingTop: "24dp",
    paddingBottom: "24dp",
    spacing: "24dp",
    items: [
      text("${data.callout.title}", { color: COLORS.primary, fontWeight: "700", fontSize: "@smallSize" }),
      {
        type: "Container",
        data: "${data.callout.lines}",
        items: [text("${data}", { fontSize: "@smallSize", paddingTop: "8dp" })],
      },
    ],
  };
}

function photo(height: string): Component {
  return {
    type: "Image",
    when: "${data.imageUrl != ''}",
    source: "${data.imageUrl}",
    width: "100%",
    height,
    scale: "best-fill",
    borderRadius: "24dp",
  };
}

/** Ingredient rows: section headings and lines; `touchable` adds "não tenho" to each line. */
function ingredientList(touchable: boolean): Component {
  const line: Component = {
    type: "Container",
    direction: "row",
    alignItems: "center",
    paddingTop: "10dp",
    paddingBottom: "10dp",
    items: [
      text("•", { color: COLORS.primary, width: "36dp" }),
      text("${data.text}", { grow: 1, shrink: 1 }),
      ...(touchable ? [text("não tenho", { color: COLORS.muted, fontSize: "@smallSize", paddingLeft: "24dp" })] : []),
    ],
  };
  return {
    type: "Sequence",
    data: "${data.rows}",
    grow: 1,
    width: "100%",
    items: [
      {
        when: "${data.kind == 'header'}",
        ...text("${data.text}", { color: COLORS.primary, fontWeight: "700", paddingTop: "20dp" }),
      },
      touchable
        ? { type: "TouchWrapper", onPress: [{ type: "SendEvent", arguments: ["substitute", "${data.name}"] }], item: line }
        : line,
    ],
  };
}

export type RenderDirective = {
  type: "Alexa.Presentation.APL.RenderDocument";
  token: string;
  document: Component;
  datasources: { data: Record<string, unknown> };
};

function render(token: string, doc: Component, data: Record<string, unknown>): RenderDirective {
  return { type: "Alexa.Presentation.APL.RenderDocument", token, document: doc, datasources: { data } };
}

export type IngredientRow = { kind: "header" | "item"; text: string; name: string };
export type Callout = { title: string; lines: string[] };

function calloutData(c: Callout | null | undefined) {
  return { hasCallout: Boolean(c), callout: c ?? { title: "", lines: [] } };
}

export function homeScreen(subtitle: string, hint: string): RenderDirective {
  return render(
    "home",
    document([
      {
        type: "Container",
        grow: 1,
        justifyContent: "center",
        alignItems: "center",
        spacing: "32dp",
        items: [
          text("Minhas Receitas", { fontSize: "@titleSize", fontWeight: "700", color: COLORS.primary }),
          text("${data.subtitle}", { fontSize: "@stepSize", textAlign: "center" }),
          text("${data.hint}", { color: COLORS.muted, textAlign: "center" }),
        ],
      },
    ]),
    { subtitle, hint },
  );
}

export type ChooserOption = { title: string; imageUrl: string; note: string };

export function chooserScreen(options: ChooserOption[]): RenderDirective {
  const card: Component = {
    type: "TouchWrapper",
    onPress: [{ type: "SendEvent", arguments: ["select", "${index + 1}"] }],
    item: {
      type: "Container",
      width: "420dp",
      paddingRight: "32dp",
      spacing: "16dp",
      items: [
        {
          type: "Frame",
          backgroundColor: COLORS.surface,
          borderRadius: "24dp",
          width: "100%",
          height: "260dp",
          item: {
            type: "Image",
            when: "${data.imageUrl != ''}",
            source: "${data.imageUrl}",
            width: "100%",
            height: "100%",
            scale: "best-fill",
            borderRadius: "24dp",
          },
        },
        text("${index + 1}. ${data.title}", { fontWeight: "700", maxLines: 3 }),
        text("${data.note}", { when: "${data.note != ''}", color: COLORS.muted, fontSize: "@smallSize" }),
      ],
    },
  };
  return render(
    "choose",
    document([
      text("Qual delas?", { fontSize: "@titleSize", fontWeight: "700" }),
      text('Diga o número, por exemplo "a segunda", ou toque na receita.', {
        color: COLORS.muted,
        paddingTop: "12dp",
        paddingBottom: "40dp",
      }),
      { type: "Sequence", scrollDirection: "horizontal", data: "${data.options}", width: "100%", grow: 1, items: [card] },
    ]),
    { options },
  );
}

export function ingredientsScreen(input: {
  title: string;
  servingsLabel: string;
  imageUrl: string;
  rows: IngredientRow[];
  hasSteps: boolean;
  callout?: Callout | null;
}): RenderDirective {
  return render(
    "ingredients",
    document([
      {
        type: "Container",
        direction: "row",
        grow: 1,
        items: [
          {
            type: "Container",
            width: "60%",
            height: "100%",
            paddingRight: "48dp",
            items: [
              text("${data.title}", { fontSize: "@titleSize", fontWeight: "700", maxLines: 2 }),
              text("Ingredientes${data.servingsLabel}", { color: COLORS.muted, paddingTop: "8dp", paddingBottom: "16dp" }),
              ingredientList(true),
            ],
          },
          {
            type: "Container",
            width: "40%",
            height: "100%",
            spacing: "32dp",
            items: [
              photo("42%"),
              callout(),
              text("${data.hint}", { color: COLORS.muted, fontSize: "@smallSize", grow: 1 }),
              { type: "Container", when: "${data.hasSteps}", alignItems: "end", items: [button("Começar o preparo", ["next"])] },
            ],
          },
        ],
      },
    ]),
    {
      ...input,
      hint: input.hasSteps
        ? 'Separe tudo e diga "Alexa, próximo". Faltou algo? Pergunte "o que posso usar no lugar de…" ou toque no ingrediente.'
        : "Essa receita ainda não tem modo de preparo cadastrado.",
      ...calloutData(input.callout),
    },
  );
}

export function stepScreen(input: {
  title: string;
  stepIndex: number;
  totalSteps: number;
  text: string;
  durationMinutes?: number;
  rows: IngredientRow[];
  callout?: Callout | null;
}): RenderDirective {
  const { stepIndex, totalSteps } = input;
  return render(
    "step",
    document([
      {
        type: "Container",
        direction: "row",
        alignItems: "center",
        items: [
          text("${data.title}", { color: COLORS.muted, grow: 1, shrink: 1, maxLines: 1 }),
          text("Passo ${data.stepNumber} de ${data.totalSteps}", { color: COLORS.primary, fontWeight: "700" }),
        ],
      },
      {
        type: "Frame",
        width: "100%",
        height: "8dp",
        borderRadius: "4dp",
        backgroundColor: COLORS.surface,
        item: { type: "Frame", width: "${data.progress}", height: "8dp", borderRadius: "4dp", backgroundColor: COLORS.primary },
      },
      {
        type: "Container",
        direction: "row",
        grow: 1,
        paddingTop: "40dp",
        items: [
          {
            type: "Container",
            width: "66%",
            height: "100%",
            paddingRight: "56dp",
            items: [
              {
                type: "ScrollView",
                grow: 1,
                item: text("${data.text}", { fontSize: "@stepSize", lineHeight: 1.3 }),
              },
              {
                type: "Container",
                when: "${data.hasDuration}",
                direction: "row",
                alignItems: "center",
                paddingTop: "24dp",
                items: [
                  text("⏱ ${data.durationLabel}", { color: COLORS.primary, fontWeight: "700", paddingRight: "32dp" }),
                  button("Marcar timer", ["timer"], false),
                ],
              },
              {
                type: "Container",
                direction: "row",
                justifyContent: "spaceBetween",
                paddingTop: "32dp",
                items: [button("Voltar", ["previous"], false), button("${data.nextLabel}", ["next"])],
              },
            ],
          },
          {
            type: "Container",
            width: "34%",
            height: "100%",
            spacing: "24dp",
            items: [
              callout(),
              text("Ingredientes", { color: COLORS.muted, fontSize: "@smallSize", fontWeight: "700" }),
              ingredientList(false),
            ],
          },
        ],
      },
    ]),
    {
      title: input.title,
      text: input.text,
      rows: input.rows,
      stepNumber: stepIndex + 1,
      totalSteps,
      progress: `${Math.round(((stepIndex + 1) / Math.max(totalSteps, 1)) * 100)}%`,
      hasDuration: Boolean(input.durationMinutes),
      durationLabel: input.durationMinutes ? formatMinutesShort(input.durationMinutes) : "",
      nextLabel: stepIndex >= totalSteps - 1 ? "Concluir" : "Próximo",
      ...calloutData(input.callout),
    },
  );
}

export function doneScreen(title: string, imageUrl: string): RenderDirective {
  return render(
    "done",
    document([
      {
        type: "Container",
        grow: 1,
        justifyContent: "center",
        alignItems: "center",
        spacing: "32dp",
        items: [
          { ...photo("50vh"), width: "50vw" },
          text("Bom apetite!", { fontSize: "@titleSize", fontWeight: "700", color: COLORS.primary }),
          text("${data.title}", { textAlign: "center" }),
        ],
      },
    ]),
    { title, imageUrl },
  );
}

/** "40 min", "1 h 30 min" */
export function formatMinutesShort(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} min`;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}
