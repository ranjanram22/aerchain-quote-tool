// Single source of truth for every model ID used in the app.
// Change a task's model here and nowhere else.
// IDs verified against https://openrouter.ai/api/v1/models on 2026-09-30.

export type ModelTask =
  | "extraction"
  | "extraction_hard"
  | "copilot"
  | "analysis"
  | "followup"
  | "ping";

export interface ModelRoute {
  model: string;
  fallback: string;
  timeoutMs: number;
}

export const EXTRACTION_MODEL = "anthropic/claude-sonnet-5.5";
export const EXTRACTION_HARD_MODEL = "anthropic/claude-opus-5.5";
export const COPILOT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
// Switched from the free Nemotron model after Phase 4 testing (see DECISIONS.md T7).
export const ANALYSIS_MODEL = "anthropic/claude-sonnet-5.5";

export const MODELS: Record<ModelTask, ModelRoute> = {
  extraction: {
    model: EXTRACTION_MODEL,
    fallback: "anthropic/claude-sonnet-5",
    timeoutMs: 240_000,
  },
  extraction_hard: {
    model: EXTRACTION_HARD_MODEL,
    fallback: "anthropic/claude-opus-5",
    timeoutMs: 280_000,
  },
  copilot: {
    model: COPILOT_MODEL,
    // Paid variant of the same model: same behaviour, no free-tier rate limits.
    fallback: "nvidia/nemotron-3-ultra-550b-a55b",
    timeoutMs: 90_000,
  },
  analysis: {
    model: ANALYSIS_MODEL,
    fallback: "anthropic/claude-sonnet-5",
    timeoutMs: 120_000,
  },
  followup: {
    model: COPILOT_MODEL,
    fallback: "nvidia/nemotron-3-ultra-550b-a55b",
    timeoutMs: 60_000,
  },
  ping: {
    model: COPILOT_MODEL,
    fallback: "nvidia/nemotron-3-ultra-550b-a55b",
    timeoutMs: 45_000,
  },
};
