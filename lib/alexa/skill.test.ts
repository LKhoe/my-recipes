import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEnvelope, ResponseEnvelope } from "ask-sdk-model";
import type { ActiveKitchenRecipe } from "@/lib/services/kitchen";
import type { RecipeNameMatch } from "@/lib/services/recipe";
import type { SubstitutionResult } from "@/lib/services/substitution";
import type { RecipeDetail } from "@/types";

const kitchen = vi.hoisted(() => ({
  getActiveKitchenRecipe: vi.fn(),
  sendToKitchen: vi.fn(),
  advanceKitchenStep: vi.fn(),
}));
const recipes = vi.hoisted(() => ({ searchRecipesByTitle: vi.fn() }));
const substitution = vi.hoisted(() => ({ suggestSubstitutes: vi.fn() }));

vi.mock("@/lib/services/kitchen", () => kitchen);
vi.mock("@/lib/services/recipe", () => recipes);
vi.mock("@/lib/services/substitution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/substitution")>()),
  suggestSubstitutes: substitution.suggestSubstitutes,
}));

const { buildSkill } = await import("./skill");

const SKILL_ID = "amzn1.ask.skill.test";

const cheesecake: RecipeDetail = {
  id: "r1",
  authorId: "u1",
  authorName: "Leo",
  title: "Cheesecake",
  description: null,
  servings: 8,
  prepTime: null,
  cookTime: null,
  steps: [
    { text: "Triture os biscoitos com a manteiga." },
    { text: "Asse a base por 40 minutos.", durationMinutes: 40 },
    { text: "Cubra com a calda." },
  ],
  ingredients: [
    { ingredientName: "biscoito maisena", quantity: 200, unit: "g", note: null, group: "Base" },
    { ingredientName: "manteiga", quantity: 100, unit: "g", note: "derretida", group: "Base" },
    { ingredientName: "margarina", quantity: 100, unit: "g", note: null, group: "Base", alternative: true },
    { ingredientName: "cream cheese", quantity: 400, unit: "g", note: null, group: "Recheio" },
  ],
  categoryIds: [],
  tags: [],
  sourceUrl: null,
  videoUrl: null,
  images: [{ id: "i1", path: "recipes/r1/photo.webp", order: 0 }],
  reviewPending: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function inKitchen(currentStepIndex = 0, factor = 1): ActiveKitchenRecipe {
  return { recipe: cheesecake, servings: 8 * factor, factor, currentStepIndex };
}

function envelope(request: Record<string, unknown>, attributes: Record<string, unknown> = {}, screen = true) {
  const system = {
    application: { applicationId: SKILL_ID },
    user: { userId: "amzn1.ask.account.test" },
    device: {
      deviceId: "device",
      supportedInterfaces: screen ? { "Alexa.Presentation.APL": { runtime: { maxVersion: "2023.2" } } } : {},
    },
    apiEndpoint: "https://api.amazonalexa.com",
    apiAccessToken: "api-token",
  };
  return {
    version: "1.0",
    session: { new: false, sessionId: "session", application: system.application, user: system.user, attributes },
    context: { System: system },
    request: { requestId: "request", timestamp: new Date().toISOString(), locale: "pt-BR", ...request },
  } as unknown as RequestEnvelope;
}

function intent(name: string, slots: Record<string, string | { value: string; id: string }> = {}) {
  return {
    type: "IntentRequest",
    intent: {
      name,
      confirmationStatus: "NONE",
      slots: Object.fromEntries(
        Object.entries(slots).map(([slotName, v]) => [
          slotName,
          typeof v === "string"
            ? { name: slotName, value: v, confirmationStatus: "NONE" }
            : {
                name: slotName,
                value: v.value,
                confirmationStatus: "NONE",
                resolutions: {
                  resolutionsPerAuthority: [
                    { authority: "custom", status: { code: "ER_SUCCESS_MATCH" }, values: [{ value: { name: v.value, id: v.id } }] },
                  ],
                },
              },
        ]),
      ),
    },
  };
}

const skill = buildSkill(SKILL_ID);

async function send(request: Record<string, unknown>, attributes: Record<string, unknown> = {}, screen = true) {
  return skill.invoke(envelope(request, attributes, screen));
}

function speech(res: ResponseEnvelope): string {
  return (res.response.outputSpeech as { ssml?: string } | undefined)?.ssml?.replace(/<\/?speak>/g, "") ?? "";
}

function directive(res: ResponseEnvelope, type: string) {
  return res.response.directives?.find((d) => d.type === type) as Record<string, unknown> | undefined;
}

function screenToken(res: ResponseEnvelope): string | undefined {
  return directive(res, "Alexa.Presentation.APL.RenderDocument")?.token as string | undefined;
}

function screenData(res: ResponseEnvelope) {
  return (directive(res, "Alexa.Presentation.APL.RenderDocument")?.datasources as { data: Record<string, unknown> }).data;
}

const match = (id: string, title: string, hasSteps = true): RecipeNameMatch => ({ id, title, imagePath: null, hasSteps });

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  kitchen.sendToKitchen.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("choosing a recipe by name", () => {
  it("asks again when nothing matches", async () => {
    recipes.searchRecipesByTitle.mockResolvedValue([]);
    const res = await send(intent("StartRecipeIntent", { recipeName: "a receita de pudim" }));
    expect(recipes.searchRecipesByTitle).toHaveBeenCalledWith("pudim", 5);
    expect(speech(res)).toContain("Não achei nenhuma receita chamada pudim");
    expect(res.response.shouldEndSession).toBe(false);
  });

  it("starts the only match on the ingredients screen, keeping the session without opening the mic", async () => {
    recipes.searchRecipesByTitle.mockResolvedValue([match("r1", "Cheesecake")]);
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen());

    const res = await send(intent("StartRecipeIntent", { recipeName: "cheesecake" }));

    expect(kitchen.sendToKitchen).toHaveBeenCalledWith("r1", null);
    expect(screenToken(res)).toBe("ingredients");
    expect(speech(res)).toContain("Aqui estão os ingredientes de Cheesecake");
    expect(res.response.shouldEndSession).toBeUndefined();
    expect(res.sessionAttributes).toEqual({ phase: "ingredients" });

    const entities = directive(res, "Dialog.UpdateDynamicEntities") as { types: { values: { name: { value: string } }[] }[] };
    expect(entities.types[0].values.map((v) => v.name.value)).toEqual([
      "biscoito maisena",
      "manteiga",
      "margarina",
      "cream cheese",
    ]);
  });

  it("shows the ingredient sections with their 'or' options on one line", async () => {
    recipes.searchRecipesByTitle.mockResolvedValue([match("r1", "Cheesecake")]);
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen());

    const res = await send(intent("StartRecipeIntent", { recipeName: "cheesecake" }));

    expect(screenData(res).rows).toEqual([
      { kind: "header", text: "Base", name: "" },
      { kind: "item", text: "200 g biscoito maisena", name: "biscoito maisena" },
      { kind: "item", text: "100 g manteiga (derretida) ou margarina", name: "manteiga" },
      { kind: "header", text: "Recheio", name: "" },
      { kind: "item", text: "400 g cream cheese", name: "cream cheese" },
    ]);
  });

  it("lists several matches and starts the one picked by ordinal", async () => {
    recipes.searchRecipesByTitle.mockResolvedValue([
      match("r1", "Cheesecake de frutas vermelhas"),
      match("r2", "Cheesecake de doce de leite"),
    ]);
    const listed = await send(intent("StartRecipeIntent", { recipeName: "cheesecake" }));

    expect(screenToken(listed)).toBe("choose");
    expect(speech(listed)).toBe("Achei 2 receitas. 1: Cheesecake de frutas vermelhas; 2: Cheesecake de doce de leite. Qual delas?");
    expect(listed.response.shouldEndSession).toBe(false);
    expect(kitchen.sendToKitchen).not.toHaveBeenCalled();

    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen());
    await send(intent("SelectRecipeIntent", { ordinal: { value: "segunda", id: "2" } }), listed.sessionAttributes);
    expect(kitchen.sendToKitchen).toHaveBeenCalledWith("r2", null);
  });

  it("picks by touch and by 'a última'", async () => {
    const attributes = { phase: "choosing", candidates: [{ id: "r1", title: "A" }, { id: "r2", title: "B" }, { id: "r3", title: "C" }] };
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen());

    await send({ type: "Alexa.Presentation.APL.UserEvent", arguments: ["select", 1] }, attributes);
    expect(kitchen.sendToKitchen).toHaveBeenLastCalledWith("r1", null);

    await send(intent("SelectRecipeIntent", { ordinal: { value: "última", id: "-1" } }), attributes);
    expect(kitchen.sendToKitchen).toHaveBeenLastCalledWith("r3", null);
  });

  it("asks again for a number out of range", async () => {
    const attributes = { phase: "choosing", candidates: [{ id: "r1", title: "A" }, { id: "r2", title: "B" }] };
    const res = await send(intent("SelectRecipeIntent", { number: "7" }), attributes);
    expect(speech(res)).toBe("Não entendi qual. Diga um número de 1 a 2.");
    expect(kitchen.sendToKitchen).not.toHaveBeenCalled();
  });

  it("starts an exact title right away even with other matches", async () => {
    recipes.searchRecipesByTitle.mockResolvedValue([match("r1", "Cheesecake"), match("r2", "Cheesecake de frutas vermelhas")]);
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen());
    const res = await send(intent("StartRecipeIntent", { recipeName: "cheesecake" }));
    expect(kitchen.sendToKitchen).toHaveBeenCalledWith("r1", null);
    expect(screenToken(res)).toBe("ingredients");
  });
});

describe("cooking", () => {
  it("goes from the ingredients to the kitchen's current step without skipping it", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    const res = await send(intent("AMAZON.NextIntent"), { phase: "ingredients" });
    expect(kitchen.advanceKitchenStep).not.toHaveBeenCalled();
    expect(speech(res)).toBe("Passo 1. Triture os biscoitos com a manteiga.");
    expect(screenToken(res)).toBe("step");
    expect(res.sessionAttributes).toEqual({ phase: "steps" });
  });

  it("advances and mentions the timer on a step with a duration", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    kitchen.advanceKitchenStep.mockResolvedValue({ currentStepIndex: 1, totalSteps: 3, currentStepText: "" });

    const res = await send(intent("AMAZON.NextIntent"), { phase: "steps" });

    expect(kitchen.advanceKitchenStep).toHaveBeenCalledWith("next");
    expect(speech(res)).toBe('Passo 2. Asse a base por 40 minutos. Esse passo leva 40 minutos. Diga "marcar timer" quando quiser.');
    expect(screenData(res)).toMatchObject({ stepNumber: 2, totalSteps: 3, hasDuration: true, durationLabel: "40 min" });
  });

  it("treats a fresh session with a recipe in the kitchen as cooking it", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    kitchen.advanceKitchenStep.mockResolvedValue({ currentStepIndex: 1, totalSteps: 3, currentStepText: "" });
    await send(intent("AMAZON.NextIntent"));
    expect(kitchen.advanceKitchenStep).toHaveBeenCalledWith("next");
  });

  it("finishes after the last step", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(2));
    const res = await send(intent("AMAZON.NextIntent"), { phase: "steps" });
    expect(kitchen.advanceKitchenStep).not.toHaveBeenCalled();
    expect(speech(res)).toBe("Pronto, Cheesecake está concluída. Bom apetite!");
    expect(screenToken(res)).toBe("done");
  });

  it("goes back to the ingredients from the first step", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    const res = await send(intent("AMAZON.PreviousIntent"), { phase: "steps" });
    expect(screenToken(res)).toBe("ingredients");
    expect(res.sessionAttributes).toEqual({ phase: "ingredients" });
  });

  it("answers a quantity scaled to the kitchen's servings", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0, 1.5));
    const res = await send(intent("QuantityIntent", { ingredient: "cream cheese" }), { phase: "steps" });
    expect(speech(res)).toBe("De cream cheese, são 600 gramas.");
  });

  it("offers to resume on launch", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(2));
    const res = await send({ type: "LaunchRequest" });
    expect(speech(res)).toContain("Você estava no passo 3 de Cheesecake.");
    expect(res.sessionAttributes).toEqual({ phase: "resume" });
    expect(res.response.shouldEndSession).toBe(false);
  });

  it("sends no screen to a device without one", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    const res = await send(intent("AMAZON.RepeatIntent"), { phase: "steps" }, false);
    expect(speech(res)).toBe("Passo 1. Triture os biscoitos com a manteiga.");
    expect(screenToken(res)).toBeUndefined();
  });
});

describe("timers", () => {
  it("creates a timer from the current step's duration", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(1));
    const res = await send(intent("TimerIntent"), { phase: "steps" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.amazonalexa.com/v1/alerts/timers");
    expect(init.headers.Authorization).toBe("Bearer api-token");
    const body = JSON.parse(init.body);
    expect(body.duration).toBe("PT40M");
    expect(body.timerLabel).toBe("Cheesecake, passo 2");
    expect(body.triggeringBehavior.operation.textToAnnounce[0].text).toBe("Acabou o tempo do passo 2 de Cheesecake.");
    expect(speech(res)).toBe("Timer de 40 minutos marcado.");
  });

  it("uses a spoken duration over the step's", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    await send(intent("TimerIntent", { duration: "PT10M" }), { phase: "steps" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).duration).toBe("PT10M");
  });

  it("asks for a duration when the step has none", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    const res = await send(intent("TimerIntent"), { phase: "steps" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speech(res)).toContain("Esse passo não tem um tempo definido.");
    expect(res.response.shouldEndSession).toBe(false);
  });

  it("asks for the timers permission and creates the timer once it's granted", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(1));
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));

    const asked = await send(intent("TimerIntent"), { phase: "steps" });
    const ask = directive(asked, "Connections.SendRequest") as { name: string; token: string };
    expect(ask.name).toBe("AskFor");
    expect(asked.response.outputSpeech).toBeUndefined();

    const granted = await send({
      type: "Connections.Response",
      name: "AskFor",
      token: ask.token,
      status: { code: "200", message: "OK" },
      payload: { status: "ACCEPTED", permissionScope: "alerts::timers:skill:readwrite" },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).duration).toBe("PT40M");
    expect(speech(granted)).toBe("Timer de 40 minutos marcado.");
  });

  it("doesn't ask again when the timer still can't be created after the permission was granted", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));
    const res = await send({
      type: "Connections.Response",
      name: "AskFor",
      token: JSON.stringify({ minutes: 40, label: "x", announcement: "y" }),
      payload: { status: "ACCEPTED" },
    });
    expect(directive(res, "Connections.SendRequest")).toBeUndefined();
    expect(speech(res)).toBe("Não consegui marcar o timer agora. Tente de novo.");
  });

  it("explains when the permission is refused", async () => {
    const res = await send({
      type: "Connections.Response",
      name: "AskFor",
      token: JSON.stringify({ minutes: 40, label: "x", announcement: "y" }),
      payload: { status: "DENIED" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speech(res)).toContain("Sem essa permissão");
  });
});

describe("substitutes", () => {
  const answer: SubstitutionResult = {
    ingredientName: "cream cheese",
    source: "ai",
    suggestions: [{ name: "ricota", quantity: 400, unit: "g", note: "bata até ficar lisa" }],
    tip: null,
  };

  it("says and shows the suggestions beside the current screen", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    substitution.suggestSubstitutes.mockResolvedValue(answer);

    const res = await send(intent("SubstituteIntent", { ingredient: "cream cheese" }), { phase: "ingredients" });

    expect(substitution.suggestSubstitutes).toHaveBeenCalledWith("r1", "cream cheese");
    expect(speech(res)).toBe("No lugar de cream cheese, você pode usar 400 gramas de ricota. Bata até ficar lisa.");
    expect(screenToken(res)).toBe("ingredients");
    expect(screenData(res)).toMatchObject({
      hasCallout: true,
      callout: { title: "No lugar de cream cheese", lines: ["400 g ricota: bata até ficar lisa"] },
    });
    // The progressive response went out first.
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.amazonalexa.com/v1/directives");
  });

  it("works from a touch on the ingredient", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    substitution.suggestSubstitutes.mockResolvedValue(answer);
    await send({ type: "Alexa.Presentation.APL.UserEvent", arguments: ["substitute", "cream cheese"] }, { phase: "ingredients" });
    expect(substitution.suggestSubstitutes).toHaveBeenCalledWith("r1", "cream cheese");
  });

  it("answers in time when the model is slow, leaving the call running", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    substitution.suggestSubstitutes.mockReturnValue(new Promise(() => {}));

    const pending = send(intent("SubstituteIntent", { ingredient: "cream cheese" }), { phase: "ingredients" });
    await vi.advanceTimersByTimeAsync(6000);
    const res = await pending;

    expect(speech(res)).toBe("Ainda estou pensando. Pergunte de novo em alguns segundos.");
  });

  it("says so when the model call fails", async () => {
    kitchen.getActiveKitchenRecipe.mockResolvedValue(inKitchen(0));
    substitution.suggestSubstitutes.mockRejectedValue(new Error("gateway down"));
    const res = await send(intent("SubstituteIntent", { ingredient: "cream cheese" }), { phase: "ingredients" });
    expect(speech(res)).toContain("Não consegui consultar os substitutos agora");
  });
});

describe("skill id", () => {
  it("refuses requests for another skill", async () => {
    const other = envelope({ type: "LaunchRequest" });
    (other.context.System.application as { applicationId: string }).applicationId = "amzn1.ask.skill.other";
    await expect(skill.invoke(other)).rejects.toThrow();
  });
});
