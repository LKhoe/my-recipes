// Calls from the skill back into Alexa's own APIs, with the short-lived `apiAccessToken` each
// request carries (context.System). Plain fetch: two endpoints don't justify the SDK's API client.

export const TIMERS_PERMISSION = "alerts::timers:skill:readwrite";

export type TimerSpec = { minutes: number; label: string; announcement: string };

export type TimerResult = "created" | "no-permission" | "failed";

/** "PT40M", "PT1H30M": the Timers API's duration format. */
export function isoDuration(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s ? `${s}S` : ""}` || "PT1S";
}

/**
 * Starts a device timer that announces `announcement` when it ends. "no-permission" means the user
 * hasn't granted the skill timers yet (ask with `askForTimersPermission`).
 */
export async function createTimer(apiEndpoint: string, apiAccessToken: string, spec: TimerSpec): Promise<TimerResult> {
  try {
    const res = await fetch(`${apiEndpoint}/v1/alerts/timers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        duration: isoDuration(spec.minutes),
        // The Timers API caps the label's length; the device shows it on the timer.
        timerLabel: spec.label.slice(0, 64),
        creationBehavior: { displayExperience: { visibility: "VISIBLE" } },
        triggeringBehavior: {
          operation: { type: "ANNOUNCE", textToAnnounce: [{ locale: "pt-BR", text: spec.announcement }] },
          notificationConfig: { playAudible: true },
        },
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 401 || res.status === 403) return "no-permission";
    if (!res.ok) {
      console.error(`[alexa] timer creation failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
      return "failed";
    }
    return "created";
  } catch (err) {
    console.error("[alexa] timer creation failed:", err);
    return "failed";
  }
}

/**
 * Voice permission prompt for timers. The pending timer rides in `token`, which Alexa hands back
 * on the Connections.Response once the user answers.
 */
export function askForTimersPermission(pending: TimerSpec) {
  return {
    type: "Connections.SendRequest" as const,
    name: "AskFor",
    payload: {
      "@type": "AskForPermissionsConsentRequest",
      "@version": "2",
      permissionScopes: [{ permissionScope: TIMERS_PERMISSION, consentLevel: "ACCOUNT" }],
    },
    token: JSON.stringify(pending),
  };
}

export function parsePendingTimer(token: string | undefined): TimerSpec | null {
  if (!token) return null;
  try {
    const value = JSON.parse(token) as Partial<TimerSpec>;
    if (typeof value.minutes !== "number" || typeof value.label !== "string" || typeof value.announcement !== "string") {
      return null;
    }
    return { minutes: value.minutes, label: value.label, announcement: value.announcement };
  } catch {
    return null;
  }
}

/**
 * Says something right away while the real answer is still being worked out (the substitution
 * call). Fire-and-forget: a failure here must not hold up or break the response.
 */
export function sendProgressiveResponse(
  apiEndpoint: string,
  apiAccessToken: string,
  requestId: string,
  speech: string,
): Promise<void> {
  return fetch(`${apiEndpoint}/v1/directives`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      header: { requestId },
      directive: { type: "VoicePlayer.Speak", speech: `<speak>${speech}</speak>` },
    }),
    signal: AbortSignal.timeout(1500),
  })
    .then(() => undefined)
    .catch(() => undefined);
}
