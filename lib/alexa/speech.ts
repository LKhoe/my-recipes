// What the Echo says, in pt-BR. Pure functions: the skill handlers (lib/alexa/skill.ts) build
// every sentence from here, so wording can be tested without a request envelope.

/** Text going into SSML (<speak>…</speak>) must not carry markup characters. */
export function ssmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "a", "a e b", "a, b e c" */
export function joinList(items: string[], conjunction = "e"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

// Carrier words the SearchQuery slot sometimes keeps ("a receita de cheesecake", "um bolo").
const QUERY_PREFIXES = /^(?:(?:a|o|um|uma)\s+)?(?:receita\s+(?:de|do|da)\s+|preparo\s+(?:de|do|da)\s+)?(?:(?:a|o|um|uma)\s+)?/i;

/** The dish name out of what Alexa heard: "a receita de Cheesecake." -> "Cheesecake". */
export function cleanRecipeQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(QUERY_PREFIXES, "")
    .trim();
}

const ORDINALS: Record<string, number> = {
  primeira: 1, primeiro: 1, um: 1, uma: 1,
  segunda: 2, segundo: 2, dois: 2, duas: 2,
  terceira: 3, terceiro: 3, tres: 3,
  quarta: 4, quarto: 4, quatro: 4,
  quinta: 5, quinto: 5, cinco: 5,
  sexta: 6, sexto: 6, seis: 6,
  setima: 7, setimo: 7, sete: 7,
  oitava: 8, oitavo: 8, oito: 8,
  nona: 9, nono: 9, nove: 9,
  decima: 10, decimo: 10, dez: 10,
  ultima: -1, ultimo: -1,
};

/**
 * Which option the user picked, 1-based: from the NUMBER slot ("número 2") or the ordinal slot
 * ("a segunda", resolved id or raw word). -1 means "a última". Null when neither says anything usable.
 */
export function parseChoice(numberSlot: string | null | undefined, ordinalSlot: string | null | undefined): number | null {
  const n = numberSlot ? Number.parseInt(numberSlot, 10) : Number.NaN;
  if (Number.isFinite(n)) return n;
  if (!ordinalSlot) return null;
  const asNumber = Number.parseInt(ordinalSlot, 10);
  if (Number.isFinite(asNumber)) return asNumber;
  const word = ordinalSlot.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().split(/\s+/).at(-1) ?? "";
  return ORDINALS[word] ?? null;
}

// Gender decides "meia xícara" vs "meio quilo"; plural is what a quantity above one says.
const UNIT_WORDS: Record<string, { one: string; many: string; feminine: boolean }> = {
  g: { one: "grama", many: "gramas", feminine: false },
  kg: { one: "quilo", many: "quilos", feminine: false },
  mg: { one: "miligrama", many: "miligramas", feminine: false },
  ml: { one: "mililitro", many: "mililitros", feminine: false },
  l: { one: "litro", many: "litros", feminine: false },
  cl: { one: "centilitro", many: "centilitros", feminine: false },
  dl: { one: "decilitro", many: "decilitros", feminine: false },
  xíc: { one: "xícara", many: "xícaras", feminine: true },
  csp: { one: "colher de sopa", many: "colheres de sopa", feminine: true },
  csb: { one: "colher de sobremesa", many: "colheres de sobremesa", feminine: true },
  cch: { one: "colher de chá", many: "colheres de chá", feminine: true },
  dente: { one: "dente", many: "dentes", feminine: false },
  pitada: { one: "pitada", many: "pitadas", feminine: true },
  fatia: { one: "fatia", many: "fatias", feminine: true },
  lata: { one: "lata", many: "latas", feminine: true },
  maço: { one: "maço", many: "maços", feminine: false },
  ramo: { one: "ramo", many: "ramos", feminine: false },
  pacote: { one: "pacote", many: "pacotes", feminine: false },
  tablete: { one: "tablete", many: "tabletes", feminine: false },
  unidade: { one: "unidade", many: "unidades", feminine: true },
  borrifo: { one: "borrifo", many: "borrifos", feminine: false },
};

const SPOKEN_FRACTIONS: [number, string][] = [
  [1 / 4, "um quarto"],
  [1 / 3, "um terço"],
  [1 / 2, "meio"],
  [2 / 3, "dois terços"],
  [3 / 4, "três quartos"],
];

// Measured by scale or jug: rounded like on screen, never "266 gramas e dois terços". Only kg and l
// keep a half ("meio quilo", "um litro e meio").
const METRIC_UNITS = new Set(["g", "mg", "ml", "cl", "dl", "kg", "l"]);
const HALF_ONLY_UNITS = new Set(["kg", "l"]);

/** 1 and 2 agree with the unit ("uma xícara", "dois dentes"); TTS reads bare digits as masculine. */
function countWord(n: number, feminine: boolean): string {
  if (n === 1) return feminine ? "uma" : "um";
  if (n === 2) return feminine ? "duas" : "dois";
  return String(n);
}

/**
 * "duas xícaras", "meia xícara", "uma xícara e meia", "um quarto de xícara", "250 gramas".
 * Weights and volumes round like on screen (lib/scale.ts); the rest snap to common fractions.
 */
export function amountForSpeech(quantity: number | null, unit: string | null): string | null {
  if (quantity === null || quantity <= 0) return null;
  const words = unit ? UNIT_WORDS[unit] : undefined;
  const feminine = words?.feminine ?? false;
  const unitWord = (plural: boolean) => (words ? (plural ? words.many : words.one) : (unit ?? ""));
  const withUnit = (amount: string, plural: boolean) => (unit ? `${amount} ${unitWord(plural)}` : amount);

  const whole = Math.floor(quantity + 0.04);
  const frac = quantity - whole;
  if (Math.abs(frac) < 0.04) return withUnit(countWord(whole, feminine), whole > 1);

  const metric = unit !== null && METRIC_UNITS.has(unit);
  const fraction = SPOKEN_FRACTIONS.find(
    ([value]) => Math.abs(frac - value) < 0.04 && (!metric || (HALF_ONLY_UNITS.has(unit) && value === 1 / 2)),
  );
  if (fraction) {
    const half = fraction[0] === 1 / 2;
    const spoken = half ? (feminine ? "meia" : "meio") : fraction[1];
    if (whole === 0) {
      if (!unit) return spoken;
      return half ? `${spoken} ${unitWord(false)}` : `${spoken} de ${unitWord(false)}`;
    }
    // "uma xícara e meia", "duas colheres de sopa e um quarto"
    return `${withUnit(countWord(whole, feminine), whole > 1)} e ${spoken}`;
  }

  const rounded = quantity >= 10 ? Math.round(quantity) : Number(quantity.toFixed(1));
  return withUnit(rounded.toLocaleString("pt-BR"), rounded >= 2);
}

const UNIT_IN_TEXT = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s?(${Object.keys(UNIT_WORDS)
    .sort((a, b) => b.length - a.length)
    .join("|")})(?![\\p{L}])`,
  "gu",
);

/**
 * Abbreviated amounts inside free text read out in full: "bata com 2 csp de iogurte" -> "bata com
 * duas colheres de sopa de iogurte". TTS would otherwise spell "c, s, p".
 */
export function expandAmountsForSpeech(text: string): string {
  return text.replace(UNIT_IN_TEXT, (match, number: string, unit: string) => {
    return amountForSpeech(Number(number.replace(",", ".")), unit) ?? match;
  });
}

/** "De açúcar, são 2 xícaras." / "De sal, a receita diz a gosto." */
export function quantitySentence(name: string, quantity: number | null, unit: string | null, note: string | null): string {
  const amount = amountForSpeech(quantity, unit);
  if (!amount) {
    return note ? `De ${name}, a receita diz ${note}.` : `A receita não diz a quantidade de ${name}.`;
  }
  const verb = quantity !== null && quantity > 1 ? "são" : "é";
  return `De ${name}, ${verb} ${amount}${note ? `, ${note}` : ""}.`;
}

/** "40 minutos", "1 hora", "1 hora e 30 minutos" */
export function minutesForSpeech(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  const h = hours > 0 ? `${hours} ${hours === 1 ? "hora" : "horas"}` : "";
  const m = minutes > 0 ? `${minutes} ${minutes === 1 ? "minuto" : "minutos"}` : "";
  return [h, m].filter(Boolean).join(" e ") || "menos de um minuto";
}

/** AMAZON.DURATION's ISO 8601 value ("PT40M", "PT1H30M", "PT90S") in minutes; null when unusable. */
export function parseIsoDurationMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return null;
  const [, d, h, m, s] = match;
  const minutes = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(m ?? 0) + Number(s ?? 0) / 60;
  return minutes > 0 ? minutes : null;
}

export function stepSpeech(stepIndex: number, totalSteps: number, text: string, durationMinutes?: number): string {
  const label = stepIndex === totalSteps - 1 && totalSteps > 1 ? "Último passo" : `Passo ${stepIndex + 1}`;
  const timerHint = durationMinutes
    ? ` Esse passo leva ${minutesForSpeech(durationMinutes)}. Diga "marcar timer" quando quiser.`
    : "";
  return `${label}. ${expandAmountsForSpeech(text)}${timerHint}`;
}

export function ingredientsSpeech(title: string, hasSteps: boolean): string {
  const next = hasSteps
    ? `Quando estiver tudo separado, diga "próximo".`
    : "Essa receita ainda não tem modo de preparo cadastrado.";
  return `Aqui estão os ingredientes de ${title}. Se faltar algum, pergunte o que usar no lugar. ${next}`;
}

// Past this many, reading every title takes longer than looking at the screen.
const MAX_SPOKEN_OPTIONS = 5;

export function chooseSpeech(titles: string[]): string {
  if (titles.length > MAX_SPOKEN_OPTIONS) {
    return `Achei ${titles.length} receitas. Diga o número da que você quer, ou toque na tela.`;
  }
  const options = titles.map((t, i) => `${i + 1}: ${t}`).join("; ");
  return `Achei ${titles.length} receitas. ${options}. Qual delas?`;
}

export type SpokenSubstitute = { name: string; quantity: number | null; unit: string | null; note: string | null };

/** The substitution answer, scaled to the servings in the kitchen. */
export function substitutionSpeech(
  ingredientName: string,
  source: "recipe" | "ai",
  suggestions: SpokenSubstitute[],
  tip: string | null,
  factor: number,
): string {
  if (suggestions.length === 0) {
    return tip ?? `Não encontrei um bom substituto para ${ingredientName}.`;
  }
  const options = suggestions.map((s) => {
    const amount = amountForSpeech(s.quantity !== null ? s.quantity * factor : null, s.unit);
    return amount ? `${amount} de ${s.name}` : s.name;
  });
  const intro =
    source === "recipe"
      ? `A própria receita diz que, no lugar de ${ingredientName}, dá para usar`
      : `No lugar de ${ingredientName}, você pode usar`;
  const note = suggestions[0].note?.trim();
  const firstNote = note ? ` ${note.charAt(0).toLocaleUpperCase("pt-BR")}${note.slice(1).replace(/\.?$/, ".")}` : "";
  return expandAmountsForSpeech(`${intro} ${joinList(options, "ou")}.${firstNote}${tip ? ` ${tip}` : ""}`);
}
