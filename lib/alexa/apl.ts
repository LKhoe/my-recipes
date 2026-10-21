// The Echo Show screens (APL documents), built as plain objects. Laid out for the Show 15 in
// either orientation (it's often wall-mounted in portrait, 1080×1920dp), with type sized by the
// screen's shorter side so the Show 8/10 and Show 5 stay readable. Text always goes in through the
// datasource (`${data.…}`), never into the document itself, so a "${" in a recipe can't be read as
// an APL expression.
import { imageSrc, isExternalImageUrl, thumbnailSrc } from "@/lib/image-url";

export const APL_INTERFACE = "Alexa.Presentation.APL";

const COLORS = {
  background: "#261C17",
  surface: "#33271F",
  surfaceStrong: "#45352A",
  foreground: "#F6EFE6",
  muted: "#B8A99A",
  primary: "#E07A55",
  primaryForeground: "#261C17",
};

// The skill stays on screen while someone cooks: the device drops back to its home screen only
// after this long without a request (each "Alexa, próximo" resets it).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const LANDSCAPE = "${viewport.width > viewport.height}";
const PORTRAIT = "${viewport.width <= viewport.height}";

/** A recipe photo as an absolute HTTPS URL the device can fetch, or "" for none. */
export function absoluteImageUrl(path: string | null | undefined, baseUrl = process.env.NEXT_PUBLIC_APP_URL): string {
  if (!path) return "";
  if (isExternalImageUrl(path)) return imageSrc(path);
  if (!baseUrl) return "";
  // JPEG: APL isn't documented to decode WebP, the format uploads are stored in.
  return `${baseUrl.replace(/\/$/, "")}${thumbnailSrc(path)}?format=jpeg`;
}

type Component = Record<string, unknown>;

function text(value: string, style: Record<string, unknown> = {}): Component {
  return { type: "Text", text: value, color: COLORS.foreground, fontSize: "@bodySize", ...style };
}

function button(label: string, event: unknown[], primary = true, extra: Record<string, unknown> = {}): Component {
  return {
    type: "TouchWrapper",
    onPress: [{ type: "SendEvent", arguments: event }],
    ...extra,
    item: {
      type: "Frame",
      backgroundColor: primary ? COLORS.primary : COLORS.surfaceStrong,
      borderRadius: "48dp",
      paddingLeft: "@buttonPadX",
      paddingRight: "@buttonPadX",
      paddingTop: "@buttonPadY",
      paddingBottom: "@buttonPadY",
      item: text(label, {
        color: primary ? COLORS.primaryForeground : COLORS.foreground,
        fontWeight: "700",
        fontSize: "@buttonSize",
        textAlign: "center",
      }),
    },
  };
}

/** "Silenciar" / "Ativar voz". The skill sets `data.muted` on every screen it sends. */
function muteButton(): Component {
  return button("${data.muted ? 'Ativar voz' : 'Silenciar'}", ["mute"], false);
}

function document(mainItems: Component[]): Component {
  return {
    type: "APL",
    version: "2023.2",
    theme: "dark",
    settings: { idleTimeout: IDLE_TIMEOUT_MS },
    resources: [
      {
        // Show 15 (either orientation)
        dimensions: {
          titleSize: "60dp",
          bodySize: "34dp",
          stepSize: "54dp",
          stepSmallSize: "32dp",
          smallSize: "28dp",
          buttonSize: "32dp",
          buttonPadX: "48dp",
          buttonPadY: "24dp",
          pad: "64dp",
          gap: "32dp",
          thumbWidth: "360dp",
          thumbHeight: "220dp",
          badge: "80dp",
          inputHeight: "110dp",
        },
      },
      {
        // Show 8 / 10
        when: "${Math.min(viewport.width, viewport.height) < 1000}",
        dimensions: {
          titleSize: "42dp",
          bodySize: "26dp",
          stepSize: "38dp",
          stepSmallSize: "24dp",
          smallSize: "22dp",
          buttonSize: "24dp",
          buttonPadX: "36dp",
          buttonPadY: "18dp",
          pad: "40dp",
          gap: "24dp",
          thumbWidth: "240dp",
          thumbHeight: "150dp",
          badge: "60dp",
          inputHeight: "84dp",
        },
      },
      {
        // Show 5
        when: "${Math.min(viewport.width, viewport.height) < 600}",
        dimensions: {
          titleSize: "30dp",
          bodySize: "20dp",
          stepSize: "28dp",
          stepSmallSize: "20dp",
          smallSize: "18dp",
          buttonSize: "20dp",
          buttonPadX: "24dp",
          buttonPadY: "12dp",
          pad: "24dp",
          gap: "16dp",
          thumbWidth: "150dp",
          thumbHeight: "96dp",
          badge: "44dp",
          inputHeight: "56dp",
        },
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

/** Substitution answer, shown on the ingredients or the current step. */
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
    spacing: "@gap",
    items: [
      text("${data.callout.title}", { color: COLORS.primary, fontWeight: "700" }),
      {
        type: "Container",
        data: "${data.callout.lines}",
        items: [text("${data}", { paddingTop: "8dp" })],
      },
    ],
  };
}

/** A photo shown whole (letterboxed, never cropped) at this height. */
function heroImage(height: string): Component {
  return {
    type: "Frame",
    when: "${data.imageUrl != ''}",
    width: "100%",
    height,
    borderRadius: "24dp",
    backgroundColor: COLORS.surface,
    item: { type: "Image", source: "${data.imageUrl}", width: "100%", height: "100%", scale: "best-fit", align: "center" },
  };
}

// 16:9 across the content width, but never more than 40% of the screen's height (landscape).
const HERO_HEIGHT = "${Math.min((viewport.width - 128) * 9 / 16, viewport.height * 0.4)}dp";

/** Ingredient rows: section headings and lines; `touchable` adds "não tenho" to each line. */
function ingredientRow(touchable: boolean): Component[] {
  const line: Component = {
    type: "Container",
    direction: "row",
    alignItems: "center",
    paddingTop: "12dp",
    paddingBottom: "12dp",
    items: [
      text("•", { color: COLORS.primary, width: "40dp" }),
      text("${data.text}", { grow: 1, shrink: 1 }),
      ...(touchable ? [text("não tenho", { color: COLORS.muted, fontSize: "@smallSize", paddingLeft: "24dp" })] : []),
    ],
  };
  return [
    {
      when: "${data.kind == 'header'}",
      ...text("${data.text}", { color: COLORS.primary, fontWeight: "700", paddingTop: "24dp" }),
    },
    touchable
      ? { type: "TouchWrapper", onPress: [{ type: "SendEvent", arguments: ["substitute", "${data.name}"] }], item: line }
      : line,
  ];
}

export type RenderDirective = {
  type: "Alexa.Presentation.APL.RenderDocument";
  token: string;
  document: Component;
  datasources: { data: Record<string, unknown> };
};

function render(token: string, doc: Component, data: Record<string, unknown>): RenderDirective {
  return { type: "Alexa.Presentation.APL.RenderDocument", token, document: doc, datasources: { data: { muted: false, ...data } } };
}

export type IngredientRow = { kind: "header" | "item"; text: string; name: string };
export type Callout = { title: string; lines: string[] };

function calloutData(c: Callout | null | undefined) {
  return { hasCallout: Boolean(c), callout: c ?? { title: "", lines: [] } };
}

/**
 * Start screen: a search box (the Echo's on-screen keyboard) for anyone who'd rather type than
 * speak, plus "Continuar" when a recipe is in the kitchen.
 */
export function homeScreen(input: { subtitle: string; hint: string; resumeTitle?: string | null }): RenderDirective {
  return render(
    "home",
    document([
      {
        type: "Container",
        id: "search",
        bind: [{ name: "query", value: "" }],
        grow: 1,
        justifyContent: "center",
        spacing: "@gap",
        items: [
          {
            type: "Container",
            direction: "row",
            alignItems: "center",
            items: [
              text("Minhas Receitas", { fontSize: "@titleSize", fontWeight: "700", color: COLORS.primary, grow: 1 }),
              muteButton(),
            ],
          },
          text("${data.subtitle}", { fontSize: "@stepSize", fontWeight: "700" }),
          {
            type: "Container",
            when: "${data.resumeTitle != ''}",
            alignItems: "start",
            items: [button("Continuar ${data.resumeTitle}", ["continue"])],
          },
          {
            type: "Container",
            direction: "row",
            alignItems: "center",
            spacing: "@gap",
            paddingTop: "@gap",
            items: [
              {
                type: "Frame",
                grow: 1,
                shrink: 1,
                height: "@inputHeight",
                backgroundColor: COLORS.surface,
                borderColor: COLORS.surfaceStrong,
                borderWidth: "2dp",
                borderRadius: "24dp",
                paddingLeft: "32dp",
                paddingRight: "32dp",
                item: {
                  type: "EditText",
                  width: "100%",
                  height: "100%",
                  fontSize: "@bodySize",
                  color: COLORS.foreground,
                  hint: "Digite o nome da receita",
                  hintColor: COLORS.muted,
                  submitKeyboardType: "search",
                  onTextChange: [{ type: "SetValue", componentId: "search", property: "query", value: "${event.source.value}" }],
                  onSubmit: [{ type: "SendEvent", arguments: ["search", "${event.source.value}"] }],
                },
              },
              button("Buscar", ["search", "${query}"]),
            ],
          },
          text("${data.hint}", { color: COLORS.muted }),
        ],
      },
    ]),
    { subtitle: input.subtitle, hint: input.hint, resumeTitle: input.resumeTitle ?? "" },
  );
}

export type ChooserOption = { title: string; imageUrl: string; note: string };

export function chooserScreen(options: ChooserOption[]): RenderDirective {
  const row: Component = {
    type: "TouchWrapper",
    onPress: [{ type: "SendEvent", arguments: ["select", "${data.number}"] }],
    item: {
      type: "Container",
      direction: "row",
      alignItems: "center",
      backgroundColor: COLORS.surface,
      borderRadius: "28dp",
      paddingLeft: "@gap",
      paddingRight: "@gap",
      paddingTop: "@gap",
      paddingBottom: "@gap",
      spacing: "@gap",
      items: [
        {
          type: "Frame",
          width: "@badge",
          height: "@badge",
          borderRadius: "40dp",
          backgroundColor: COLORS.primary,
          item: text("${data.number}", {
            width: "100%",
            height: "100%",
            textAlign: "center",
            textAlignVertical: "center",
            color: COLORS.primaryForeground,
            fontWeight: "700",
          }),
        },
        {
          type: "Frame",
          width: "@thumbWidth",
          height: "@thumbHeight",
          borderRadius: "20dp",
          backgroundColor: COLORS.surfaceStrong,
          item: {
            type: "Image",
            when: "${data.imageUrl != ''}",
            source: "${data.imageUrl}",
            width: "100%",
            height: "100%",
            scale: "best-fill",
          },
        },
        {
          type: "Container",
          grow: 1,
          shrink: 1,
          spacing: "8dp",
          items: [
            text("${data.title}", { fontWeight: "700", maxLines: 3 }),
            text("${data.note}", { when: "${data.note != ''}", color: COLORS.muted, fontSize: "@smallSize" }),
          ],
        },
      ],
    },
  };
  return render(
    "choose",
    document([
      {
        type: "Container",
        direction: "row",
        alignItems: "center",
        items: [text("Qual delas?", { fontSize: "@titleSize", fontWeight: "700", grow: 1 }), muteButton()],
      },
      text('Diga o número, por exemplo "a segunda", ou toque na receita.', {
        color: COLORS.muted,
        paddingTop: "12dp",
        paddingBottom: "@gap",
      }),
      {
        type: "Sequence",
        data: "${data.options}",
        width: "100%",
        grow: 1,
        items: [{ type: "Container", paddingBottom: "@gap", items: [row] }],
      },
    ]),
    // The number is in the data: `${index}` inside the row would be the row's own child index.
    { options: options.map((o, i) => ({ ...o, number: i + 1 })) },
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
        type: "Sequence",
        data: "${data.rows}",
        width: "100%",
        grow: 1,
        // Photo and title scroll away with the list, leaving room for long recipes.
        firstItem: {
          type: "Container",
          spacing: "@gap",
          paddingBottom: "@gap",
          items: [
            heroImage(HERO_HEIGHT),
            {
              type: "Container",
              items: [
                text("${data.title}", { fontSize: "@titleSize", fontWeight: "700", maxLines: 3 }),
                text("Ingredientes${data.servingsLabel}", { color: COLORS.muted, paddingTop: "8dp" }),
              ],
            },
            callout(),
          ],
        },
        items: ingredientRow(true),
      },
      {
        type: "Container",
        direction: "row",
        alignItems: "center",
        spacing: "@gap",
        paddingTop: "@gap",
        items: [
          text("${data.hint}", { color: COLORS.muted, fontSize: "@smallSize", grow: 1, shrink: 1 }),
          muteButton(),
          { type: "Container", when: "${data.hasSteps}", items: [button("Começar o preparo", ["next"])] },
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

export type StepItem = { text: string; durationMinutes?: number };

/** The current step, highlighted, followed by the ones still to come. */
function stepList(): Component {
  return {
    type: "Sequence",
    data: "${data.steps}",
    width: "100%",
    grow: 1,
    shrink: 1,
    items: [
      {
        type: "Container",
        when: "${data.current}",
        paddingBottom: "@gap",
        items: [
          {
            type: "Frame",
            backgroundColor: COLORS.surface,
            borderColor: COLORS.primary,
            borderWidth: "4dp",
            borderRadius: "28dp",
            item: {
              type: "Container",
              paddingLeft: "40dp",
              paddingRight: "40dp",
              paddingTop: "32dp",
              paddingBottom: "32dp",
              spacing: "16dp",
              items: [
                text("Passo ${data.number}", { color: COLORS.primary, fontWeight: "700", fontSize: "@smallSize" }),
                text("${data.text}", { fontSize: "@stepSize", lineHeight: 1.25 }),
                {
                  type: "Container",
                  when: "${data.durationLabel != ''}",
                  direction: "row",
                  alignItems: "center",
                  spacing: "@gap",
                  paddingTop: "8dp",
                  items: [
                    text("⏱ ${data.durationLabel}", { color: COLORS.primary, fontWeight: "700" }),
                    button("Marcar timer", ["timer"], false),
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        type: "Container",
        paddingLeft: "40dp",
        paddingRight: "40dp",
        paddingBottom: "@gap",
        spacing: "8dp",
        items: [
          text("Passo ${data.number}${data.durationLabel != '' ? ' · ' + data.durationLabel : ''}", {
            color: COLORS.muted,
            fontWeight: "700",
            fontSize: "@smallSize",
          }),
          text("${data.text}", { fontSize: "@stepSmallSize", color: COLORS.muted }),
        ],
      },
    ],
  };
}

export function stepScreen(input: {
  title: string;
  stepIndex: number;
  steps: StepItem[];
  rows: IngredientRow[];
  callout?: Callout | null;
}): RenderDirective {
  const { stepIndex, steps } = input;
  const totalSteps = steps.length;
  return render(
    "step",
    document([
      {
        type: "Container",
        direction: "row",
        alignItems: "center",
        spacing: "@gap",
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
        shrink: 1,
        paddingTop: "@gap",
        spacing: "@pad",
        items: [
          {
            type: "Container",
            grow: 1,
            shrink: 1,
            spacing: "@gap",
            // In landscape the callout sits in the ingredients column instead.
            items: [stepList(), { ...callout(), when: "${data.hasCallout && viewport.width <= viewport.height}" }],
          },
          {
            // Landscape only: the ingredients beside the steps. In portrait they're a button away.
            type: "Container",
            when: LANDSCAPE,
            width: "34%",
            spacing: "@gap",
            items: [
              callout(),
              text("Ingredientes", { color: COLORS.muted, fontSize: "@smallSize", fontWeight: "700" }),
              { type: "Sequence", data: "${data.rows}", grow: 1, items: ingredientRow(false) },
            ],
          },
        ],
      },
      {
        type: "Container",
        direction: "row",
        justifyContent: "spaceBetween",
        alignItems: "center",
        paddingTop: "@gap",
        items: [
          button("Voltar", ["previous"], false),
          button("Ingredientes", ["ingredients"], false, { when: PORTRAIT }),
          muteButton(),
          button("${data.nextLabel}", ["next"]),
        ],
      },
    ]),
    {
      title: input.title,
      rows: input.rows,
      steps: steps.slice(stepIndex).map((step, i) => ({
        number: stepIndex + i + 1,
        text: step.text,
        durationLabel: step.durationMinutes ? formatMinutesShort(step.durationMinutes) : "",
        current: i === 0,
      })),
      stepNumber: stepIndex + 1,
      totalSteps,
      progress: `${Math.round(((stepIndex + 1) / Math.max(totalSteps, 1)) * 100)}%`,
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
        spacing: "@gap",
        items: [
          heroImage(HERO_HEIGHT),
          text("Bom apetite!", { fontSize: "@titleSize", fontWeight: "700", color: COLORS.primary, textAlign: "center" }),
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
