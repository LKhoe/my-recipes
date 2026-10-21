// The "Minhas Receitas" custom skill (SPEC §9.2), served from POST /api/alexa/skill. Thin skill,
// fat app: every handler reads and writes the same KitchenState as web cook mode, so the Echo and a
// phone stay on the same step. The conversation's phase (choosing a recipe / ingredients / steps)
// lives in session attributes; the recipe and step live in the database.
import * as Alexa from "ask-sdk-core";
import type { ErrorHandler, HandlerInput, RequestHandler } from "ask-sdk-core";
import type { Response } from "ask-sdk-model";
import { formatIngredientChoice, formatIngredientLine } from "@/lib/format";
import { groupAlternatives } from "@/lib/ingredient-alternatives";
import { groupIngredientSections } from "@/lib/ingredient-groups";
import { advanceKitchenStep, getActiveKitchenRecipe, sendToKitchen, type ActiveKitchenRecipe } from "@/lib/services/kitchen";
import { LLMLimitError } from "@/lib/services/llm";
import { searchRecipesByTitle } from "@/lib/services/recipe";
import { findRecipeIngredient, ingredientKey, suggestSubstitutes } from "@/lib/services/substitution";
import {
  absoluteImageUrl,
  APL_INTERFACE,
  chooserScreen,
  doneScreen,
  homeScreen,
  ingredientsScreen,
  stepScreen,
  type Callout,
  type IngredientRow,
  type RenderDirective,
} from "@/lib/alexa/apl";
import {
  chooseSpeech,
  cleanRecipeQuery,
  ingredientsSpeech,
  minutesForSpeech,
  parseChoice,
  parseIsoDurationMinutes,
  quantitySentence,
  ssmlEscape,
  stepSpeech,
  substitutionSpeech,
} from "@/lib/alexa/speech";
import {
  askForTimersPermission,
  createTimer,
  parsePendingTimer,
  sendProgressiveResponse,
  type TimerSpec,
} from "@/lib/alexa/timers";

type Phase = "resume" | "choosing" | "ingredients" | "steps" | "done";
type Candidate = { id: string; title: string };
type SessionState = { phase?: Phase; candidates?: Candidate[] };

const MAX_CANDIDATES = 5;
// Alexa drops a response after 8 s; the rest is left for the database and the network.
export const SUBSTITUTION_WAIT_MS = 6000;

const ASK_RECIPE = 'Qual receita você quer preparar? Diga, por exemplo, "preparar cheesecake".';

function session(h: HandlerInput): SessionState {
  return h.attributesManager.getSessionAttributes() as SessionState;
}

function setSession(h: HandlerInput, state: SessionState) {
  h.attributesManager.setSessionAttributes(state);
}

/** The phase this request is in; a fresh session with a recipe in the kitchen is cooking it. */
function currentPhase(h: HandlerInput, kitchen: ActiveKitchenRecipe | null): Phase | null {
  const phase = session(h).phase;
  if (phase) return phase;
  return kitchen && kitchen.recipe.steps.length > 0 ? "steps" : null;
}

function hasScreen(h: HandlerInput): boolean {
  return Boolean(Alexa.getSupportedInterfaces(h.requestEnvelope)[APL_INTERFACE]);
}

type Reply = {
  speech?: string;
  screen?: RenderDirective;
  /** Opens the mic for an answer, with this reprompt. */
  listen?: string;
  end?: boolean;
};

/**
 * Without `listen` or `end`, shouldEndSession stays unset: on a screen device the skill keeps the
 * display and the session with the mic closed, so "Alexa, próximo" comes back here.
 */
function reply(h: HandlerInput, { speech, screen, listen, end }: Reply): Response {
  const builder = h.responseBuilder;
  if (speech) builder.speak(ssmlEscape(speech));
  if (screen && hasScreen(h)) builder.addDirective(screen);
  if (listen) builder.reprompt(ssmlEscape(listen));
  else if (end) builder.withShouldEndSession(true);
  return builder.getResponse();
}

function ingredientRows(kitchen: ActiveKitchenRecipe): IngredientRow[] {
  const rows: IngredientRow[] = [];
  for (const section of groupIngredientSections(kitchen.recipe.ingredients)) {
    if (section.group) rows.push({ kind: "header", text: section.group, name: "" });
    for (const { primary, alternatives } of groupAlternatives(section.rows)) {
      rows.push({
        kind: "item",
        text: formatIngredientChoice(
          primary.item,
          alternatives.map((a) => a.item),
          kitchen.factor,
        ),
        name: primary.item.ingredientName,
      });
    }
  }
  return rows;
}

function recipeImage(kitchen: ActiveKitchenRecipe): string {
  return absoluteImageUrl(kitchen.recipe.images[0]?.path);
}

function ingredientsView(kitchen: ActiveKitchenRecipe, callout?: Callout | null): RenderDirective {
  return ingredientsScreen({
    title: kitchen.recipe.title,
    servingsLabel: kitchen.servings ? ` (${kitchen.servings} porções)` : "",
    imageUrl: recipeImage(kitchen),
    rows: ingredientRows(kitchen),
    hasSteps: kitchen.recipe.steps.length > 0,
    callout,
  });
}

function stepView(kitchen: ActiveKitchenRecipe, index: number, callout?: Callout | null): RenderDirective {
  const step = kitchen.recipe.steps[index];
  return stepScreen({
    title: kitchen.recipe.title,
    stepIndex: index,
    totalSteps: kitchen.recipe.steps.length,
    text: step?.text ?? "",
    durationMinutes: step?.durationMinutes,
    rows: ingredientRows(kitchen),
    callout,
  });
}

/** The screen for where the cook is now, e.g. after a spoken answer that changed nothing on it. */
function currentView(h: HandlerInput, kitchen: ActiveKitchenRecipe, callout?: Callout | null): RenderDirective {
  return currentPhase(h, kitchen) === "ingredients" || kitchen.recipe.steps.length === 0
    ? ingredientsView(kitchen, callout)
    : stepView(kitchen, kitchen.currentStepIndex, callout);
}

function speakStep(kitchen: ActiveKitchenRecipe, index: number): string {
  const step = kitchen.recipe.steps[index];
  return stepSpeech(index, kitchen.recipe.steps.length, step.text, step.durationMinutes);
}

function askForRecipe(h: HandlerInput, speech = ASK_RECIPE): Response {
  setSession(h, {});
  return reply(h, {
    speech,
    screen: homeScreen("Qual receita você quer preparar?", 'Diga "preparar" e o nome da receita'),
    listen: ASK_RECIPE,
  });
}

// ---------------------------------------------------------------------------
// Actions, shared by voice intents and screen touches
// ---------------------------------------------------------------------------

async function startRecipe(h: HandlerInput, recipeId: string): Promise<Response> {
  await sendToKitchen(recipeId, null);
  const kitchen = await getActiveKitchenRecipe();
  if (!kitchen) return askForRecipe(h, "Não consegui abrir essa receita. " + ASK_RECIPE);

  setSession(h, { phase: "ingredients" });

  // Teaches the {ingredient} slot this recipe's own names ("cream cheese", "fermento em pó").
  const names = [...new Map(kitchen.recipe.ingredients.map((i) => [ingredientKey(i.ingredientName), i.ingredientName])).values()];
  if (names.length > 0) {
    h.responseBuilder.addDirective({
      type: "Dialog.UpdateDynamicEntities",
      updateBehavior: "REPLACE",
      types: [{ name: "INGREDIENT", values: names.slice(0, 100).map((name, i) => ({ id: `i${i}`, name: { value: name } })) }],
    });
  }

  return reply(h, {
    speech: ingredientsSpeech(kitchen.recipe.title, kitchen.recipe.steps.length > 0),
    screen: ingredientsView(kitchen),
  });
}

async function searchAndStart(h: HandlerInput, rawQuery: string | null): Promise<Response> {
  const query = cleanRecipeQuery(rawQuery);
  if (!query) return askForRecipe(h);

  const matches = await searchRecipesByTitle(query, MAX_CANDIDATES);
  if (matches.length === 0) {
    return askForRecipe(h, `Não achei nenhuma receita chamada ${query}. ${ASK_RECIPE}`);
  }

  const exact = matches.find((m) => ingredientKey(m.title) === ingredientKey(query));
  if (exact || matches.length === 1) return startRecipe(h, (exact ?? matches[0]).id);

  setSession(h, { phase: "choosing", candidates: matches.map((m) => ({ id: m.id, title: m.title })) });
  return reply(h, {
    speech: chooseSpeech(matches.map((m) => m.title)),
    screen: chooserScreen(
      matches.map((m) => ({
        title: m.title,
        imageUrl: absoluteImageUrl(m.imagePath),
        note: m.hasSteps ? "" : "Sem modo de preparo",
      })),
    ),
    listen: `Qual delas? Diga um número de 1 a ${matches.length}.`,
  });
}

async function selectCandidate(h: HandlerInput, choice: number | null): Promise<Response> {
  const { phase, candidates } = session(h);
  if (phase !== "choosing" || !candidates?.length) {
    return askForRecipe(h, `Primeiro diga qual receita quer preparar. ${ASK_RECIPE}`);
  }
  const index = choice === -1 ? candidates.length : choice;
  if (!index || index < 1 || index > candidates.length) {
    const ask = `Diga um número de 1 a ${candidates.length}.`;
    return reply(h, { speech: `Não entendi qual. ${ask}`, listen: ask });
  }
  return startRecipe(h, candidates[index - 1].id);
}

async function goNext(h: HandlerInput): Promise<Response> {
  const kitchen = await getActiveKitchenRecipe();
  if (!kitchen) return askForRecipe(h);
  const phase = currentPhase(h, kitchen);
  const total = kitchen.recipe.steps.length;

  if (phase === "choosing") {
    const ask = 'Diga o número da receita, por exemplo "a primeira".';
    return reply(h, { speech: ask, listen: ask });
  }
  if (total === 0) {
    setSession(h, { phase: "ingredients" });
    return reply(h, { speech: "Essa receita ainda não tem modo de preparo cadastrado.", screen: ingredientsView(kitchen) });
  }
  if (phase === "resume" && kitchen.currentStepIndex === 0) {
    setSession(h, { phase: "ingredients" });
    return reply(h, { speech: ingredientsSpeech(kitchen.recipe.title, true), screen: ingredientsView(kitchen) });
  }
  if (phase === "done") {
    return reply(h, {
      speech: `${kitchen.recipe.title} já terminou. Para outra receita, diga "preparar" e o nome dela.`,
    });
  }
  // From the ingredients (or a resumed session) to the step the kitchen is on, without skipping it.
  if (phase !== "steps") {
    setSession(h, { phase: "steps" });
    return reply(h, { speech: speakStep(kitchen, kitchen.currentStepIndex), screen: stepView(kitchen, kitchen.currentStepIndex) });
  }
  if (kitchen.currentStepIndex >= total - 1) {
    setSession(h, { phase: "done" });
    return reply(h, {
      speech: `Pronto, ${kitchen.recipe.title} está concluída. Bom apetite!`,
      screen: doneScreen(kitchen.recipe.title, recipeImage(kitchen)),
    });
  }

  const moved = await advanceKitchenStep("next");
  const index = moved?.currentStepIndex ?? kitchen.currentStepIndex;
  setSession(h, { phase: "steps" });
  return reply(h, { speech: speakStep(kitchen, index), screen: stepView(kitchen, index) });
}

async function goPrevious(h: HandlerInput): Promise<Response> {
  const kitchen = await getActiveKitchenRecipe();
  if (!kitchen) return askForRecipe(h);
  const phase = currentPhase(h, kitchen);

  if (phase === "done") {
    setSession(h, { phase: "steps" });
    return reply(h, { speech: speakStep(kitchen, kitchen.currentStepIndex), screen: stepView(kitchen, kitchen.currentStepIndex) });
  }
  if (phase !== "steps") return repeat(h);
  if (kitchen.currentStepIndex === 0) {
    setSession(h, { phase: "ingredients" });
    return reply(h, {
      speech: 'Voltando aos ingredientes. Diga "próximo" para ir ao primeiro passo.',
      screen: ingredientsView(kitchen),
    });
  }

  const moved = await advanceKitchenStep("previous");
  const index = moved?.currentStepIndex ?? kitchen.currentStepIndex;
  return reply(h, { speech: speakStep(kitchen, index), screen: stepView(kitchen, index) });
}

async function repeat(h: HandlerInput): Promise<Response> {
  const kitchen = await getActiveKitchenRecipe();
  const phase = currentPhase(h, kitchen);
  if (!kitchen || !phase) return askForRecipe(h);
  if (phase === "choosing") {
    const titles = (session(h).candidates ?? []).map((c) => c.title);
    return reply(h, { speech: chooseSpeech(titles), listen: `Diga um número de 1 a ${titles.length}.` });
  }
  if (phase === "steps" && kitchen.recipe.steps.length > 0) {
    return reply(h, { speech: speakStep(kitchen, kitchen.currentStepIndex), screen: stepView(kitchen, kitchen.currentStepIndex) });
  }
  if (phase === "done") {
    return reply(h, { speech: `${kitchen.recipe.title} já terminou. Bom apetite!` });
  }
  return reply(h, {
    speech: ingredientsSpeech(kitchen.recipe.title, kitchen.recipe.steps.length > 0),
    screen: ingredientsView(kitchen),
  });
}

async function showIngredients(h: HandlerInput): Promise<Response> {
  const kitchen = await getActiveKitchenRecipe();
  if (!kitchen) return askForRecipe(h);
  const wasCooking = currentPhase(h, kitchen) === "steps";
  setSession(h, { phase: "ingredients" });
  return reply(h, {
    speech: wasCooking
      ? `Aqui estão os ingredientes. Diga "próximo" para voltar ao passo ${kitchen.currentStepIndex + 1}.`
      : ingredientsSpeech(kitchen.recipe.title, kitchen.recipe.steps.length > 0),
    screen: ingredientsView(kitchen),
  });
}

async function answerQuantity(h: HandlerInput, name: string | null): Promise<Response> {
  const kitchen = await getActiveKitchenRecipe();
  if (!kitchen) return askForRecipe(h);
  if (!name) return reply(h, { speech: "Qual ingrediente?", listen: 'Diga, por exemplo, "quanto vai de açúcar".' });

  const target = findRecipeIngredient(kitchen.recipe.ingredients, name);
  if (!target) return reply(h, { speech: `Não encontrei ${name} em ${kitchen.recipe.title}.` });
  const quantity = target.quantity !== null ? target.quantity * kitchen.factor : null;
  return reply(h, { speech: quantitySentence(target.ingredientName, quantity, target.unit, target.note) });
}

type Outcome<T> = { kind: "ok"; value: T } | { kind: "timeout" } | { kind: "error"; error: unknown };

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<Outcome<T>> {
  return Promise.race([
    promise.then(
      (value): Outcome<T> => ({ kind: "ok", value }),
      (error): Outcome<T> => ({ kind: "error", error }),
    ),
    new Promise<Outcome<T>>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), ms)),
  ]);
}

async function answerSubstitute(h: HandlerInput, name: string | null): Promise<Response> {
  const startedAt = Date.now();
  const kitchen = await getActiveKitchenRecipe();
  if (!kitchen) return askForRecipe(h);
  if (!name) {
    return reply(h, {
      speech: "Qual ingrediente está faltando?",
      listen: 'Diga, por exemplo, "o que posso usar no lugar de manteiga".',
    });
  }

  const { apiEndpoint, apiAccessToken } = h.requestEnvelope.context.System;
  if (apiAccessToken) {
    void sendProgressiveResponse(
      apiEndpoint,
      apiAccessToken,
      h.requestEnvelope.request.requestId,
      ssmlEscape(`Deixa eu ver o que dá para usar no lugar de ${name}.`),
    );
  }

  // Keeps running past the deadline: it fills the cache, so asking again answers at once.
  const pending = suggestSubstitutes(kitchen.recipe.id, name);
  pending.catch((err) => console.error("[alexa] substitution failed:", err));
  const outcome = await withDeadline(pending, Math.max(SUBSTITUTION_WAIT_MS - (Date.now() - startedAt), 1000));

  if (outcome.kind === "timeout") {
    return reply(h, { speech: "Ainda estou pensando. Pergunte de novo em alguns segundos." });
  }
  if (outcome.kind === "error" || !outcome.value) {
    const limit = outcome.kind === "error" && outcome.error instanceof LLMLimitError;
    return reply(h, {
      speech: limit
        ? "O limite de uso da inteligência artificial foi atingido. Tente mais tarde."
        : "Não consegui consultar os substitutos agora. Tente de novo daqui a pouco.",
    });
  }

  const result = outcome.value;
  const lines = result.suggestions.map((s) => {
    const line = formatIngredientLine({ ingredientName: s.name, quantity: s.quantity, unit: s.unit, note: null }, kitchen.factor);
    return s.note ? `${line}: ${s.note}` : line;
  });
  if (result.tip) lines.push(result.tip);
  if (lines.length === 0) lines.push("Não encontrei um bom substituto.");

  return reply(h, {
    speech: substitutionSpeech(result.ingredientName, result.source, result.suggestions, result.tip, kitchen.factor),
    screen: currentView(h, kitchen, { title: `No lugar de ${result.ingredientName}`, lines }),
  });
}

async function setTimer(h: HandlerInput, durationSlot: string | null): Promise<Response> {
  const kitchen = await getActiveKitchenRecipe();
  if (!kitchen) return askForRecipe(h);

  const cooking = currentPhase(h, kitchen) === "steps";
  const step = cooking ? kitchen.recipe.steps[kitchen.currentStepIndex] : undefined;
  const minutes = parseIsoDurationMinutes(durationSlot) ?? step?.durationMinutes ?? null;
  if (!minutes) {
    const ask = 'Diga, por exemplo, "marcar timer de 10 minutos".';
    return reply(h, { speech: `Esse passo não tem um tempo definido. ${ask}`, listen: ask });
  }

  const stepLabel = step ? `passo ${kitchen.currentStepIndex + 1}` : null;
  const spec: TimerSpec = {
    minutes,
    label: stepLabel ? `${kitchen.recipe.title}, ${stepLabel}` : kitchen.recipe.title,
    announcement: stepLabel
      ? `Acabou o tempo do ${stepLabel} de ${kitchen.recipe.title}.`
      : `Acabou o timer de ${kitchen.recipe.title}.`,
  };
  return createTimerAndReply(h, spec);
}

/** `askPermission: false` after the permission prompt was answered, so a refusal can't loop. */
async function createTimerAndReply(h: HandlerInput, spec: TimerSpec, askPermission = true): Promise<Response> {
  const { apiEndpoint, apiAccessToken } = h.requestEnvelope.context.System;
  const result = apiAccessToken ? await createTimer(apiEndpoint, apiAccessToken, spec) : "no-permission";
  if (result === "no-permission" && askPermission) {
    // The voice permission prompt takes over the turn: no speech of our own, and Alexa ends it.
    return h.responseBuilder.addDirective(askForTimersPermission(spec)).withShouldEndSession(true).getResponse();
  }
  if (result !== "created") return reply(h, { speech: "Não consegui marcar o timer agora. Tente de novo." });
  return reply(h, { speech: `Timer de ${minutesForSpeech(spec.minutes)} marcado.` });
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

function isIntent(h: HandlerInput, ...names: string[]): boolean {
  return (
    Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
    names.includes(Alexa.getIntentName(h.requestEnvelope))
  );
}

function slot(h: HandlerInput, name: string): string | null {
  const s = Alexa.getSlot(h.requestEnvelope, name);
  if (!s) return null;
  // A custom type's resolved value (the ORDINAL id "2" for "segunda"), else what was heard.
  const resolved = s.resolutions?.resolutionsPerAuthority?.find((r) => r.status.code === "ER_SUCCESS_MATCH")?.values?.[0]
    ?.value;
  return resolved?.id && name === "ordinal" ? resolved.id : (resolved?.name ?? s.value ?? null);
}

const LaunchHandler: RequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === "LaunchRequest",
  async handle(h) {
    const kitchen = await getActiveKitchenRecipe();
    if (!kitchen || kitchen.recipe.steps.length === 0) return askForRecipe(h, `Olá! ${ASK_RECIPE}`);

    setSession(h, { phase: "resume" });
    const where =
      kitchen.currentStepIndex > 0
        ? `Você estava no passo ${kitchen.currentStepIndex + 1} de ${kitchen.recipe.title}.`
        : `A receita na cozinha é ${kitchen.recipe.title}.`;
    const ask = 'Diga "continuar", ou "preparar" e o nome de outra receita.';
    return reply(h, {
      speech: `${where} ${ask}`,
      screen: homeScreen(`Continuar ${kitchen.recipe.title}?`, ask),
      listen: ask,
    });
  },
};

const StartRecipeHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "StartRecipeIntent"),
  handle: (h) => searchAndStart(h, slot(h, "recipeName")),
};

const SelectRecipeHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "SelectRecipeIntent"),
  handle: (h) => selectCandidate(h, parseChoice(slot(h, "number"), slot(h, "ordinal"))),
};

const NextHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "AMAZON.NextIntent"),
  handle: goNext,
};

const PreviousHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "AMAZON.PreviousIntent"),
  handle: goPrevious,
};

const RepeatHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "AMAZON.RepeatIntent"),
  handle: repeat,
};

const IngredientsHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "IngredientsIntent"),
  handle: showIngredients,
};

const QuantityHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "QuantityIntent"),
  handle: (h) => answerQuantity(h, slot(h, "ingredient")),
};

const SubstituteHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "SubstituteIntent"),
  handle: (h) => answerSubstitute(h, slot(h, "ingredient")),
};

const TimerHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "TimerIntent"),
  handle: (h) => setTimer(h, slot(h, "duration")),
};

/** The answer to the timers permission prompt (askForTimersPermission). */
const PermissionResponseHandler: RequestHandler = {
  canHandle: (h) =>
    Alexa.getRequestType(h.requestEnvelope) === "Connections.Response" &&
    (h.requestEnvelope.request as { name?: string }).name === "AskFor",
  async handle(h) {
    const request = h.requestEnvelope.request as { token?: string; payload?: { status?: string } };
    const pending = parsePendingTimer(request.token);
    if (request.payload?.status !== "ACCEPTED" || !pending) {
      return reply(h, {
        speech: "Tudo bem. Sem essa permissão eu não consigo marcar timers; dá para ativar no app Alexa, nas configurações da skill.",
      });
    }
    const kitchen = await getActiveKitchenRecipe();
    if (kitchen) h.responseBuilder.addDirective(currentView(h, kitchen));
    return createTimerAndReply(h, pending, false);
  },
};

/** Touches on the screen: SendEvent arguments from lib/alexa/apl.ts. */
const TouchHandler: RequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === "Alexa.Presentation.APL.UserEvent",
  handle(h) {
    const args = ((h.requestEnvelope.request as { arguments?: unknown[] }).arguments ?? []).map(String);
    switch (args[0]) {
      case "select":
        return selectCandidate(h, Number.parseInt(args[1], 10) || null);
      case "next":
        return goNext(h);
      case "previous":
        return goPrevious(h);
      case "timer":
        return setTimer(h, null);
      case "substitute":
        return answerSubstitute(h, args[1] || null);
      default:
        return h.responseBuilder.getResponse();
    }
  },
};

const HelpHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "AMAZON.HelpIntent"),
  async handle(h) {
    const kitchen = await getActiveKitchenRecipe();
    const phase = currentPhase(h, kitchen);
    const speech =
      phase === "choosing"
        ? 'Diga o número da receita que você quer, por exemplo "a segunda".'
        : phase === "ingredients" || phase === "resume"
          ? 'Separe os ingredientes da tela e diga "próximo" para começar. Se faltar algum, pergunte "o que posso usar no lugar de" e o ingrediente.'
          : phase === "steps"
            ? 'Diga "próximo", "voltar" ou "repetir". Se o passo tiver tempo, diga "marcar timer". Também dá para perguntar "quanto vai de" um ingrediente.'
            : ASK_RECIPE;
    return reply(h, { speech, listen: "O que você quer fazer?" });
  },
};

const StopHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "AMAZON.StopIntent", "AMAZON.CancelIntent", "AMAZON.NavigateHomeIntent"),
  handle: (h) =>
    reply(h, {
      speech: 'Até logo! A receita fica salva: diga "Alexa, abre minhas receitas" para continuar.',
      end: true,
    }),
};

const FallbackHandler: RequestHandler = {
  canHandle: (h) => isIntent(h, "AMAZON.FallbackIntent"),
  handle: (h) =>
    reply(h, {
      speech:
        'Não entendi. Você pode dizer "próximo", "voltar", "repetir", "marcar timer", ou perguntar o que usar no lugar de um ingrediente.',
      listen: "O que você quer fazer?",
    }),
};

const SessionEndedHandler: RequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === "SessionEndedRequest",
  handle: (h) => h.responseBuilder.getResponse(),
};

const ErrorLogger: ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error("[alexa] handler error:", error);
    return reply(h, { speech: "Desculpe, algo deu errado. Tente de novo." });
  },
};

export function buildSkill(skillId: string | undefined) {
  const builder = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
      LaunchHandler,
      StartRecipeHandler,
      SelectRecipeHandler,
      NextHandler,
      PreviousHandler,
      RepeatHandler,
      IngredientsHandler,
      QuantityHandler,
      SubstituteHandler,
      TimerHandler,
      PermissionResponseHandler,
      TouchHandler,
      HelpHandler,
      StopHandler,
      FallbackHandler,
      SessionEndedHandler,
    )
    .addErrorHandlers(ErrorLogger);
  if (skillId) builder.withSkillId(skillId);
  return builder.create();
}
