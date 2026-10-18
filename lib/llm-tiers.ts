// The tiers of LocalInfra's LLM gateway, shared by the import box and the server. The gateway picks
// the model for each: simple = free models (a small local model when they fail), medium = cheap
// paid models, hard = the best, pricier ones. Paid tiers count against this app's limits there.
export const LLM_TIERS = ["simple", "medium", "hard"] as const;
export type LLMTier = (typeof LLM_TIERS)[number];
export const DEFAULT_LLM_TIER: LLMTier = "simple";

export const LLM_TIER_LABELS: Record<LLMTier, { label: string; hint: string }> = {
  simple: { label: "Simples", hint: "grátis" },
  medium: { label: "Médio", hint: "barato" },
  hard: { label: "Avançado", hint: "melhor, mais caro" },
};
