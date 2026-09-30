// Single source of truth for every model used in the app. FREE MODELS ONLY.
// Each task has an ordered chain: the first model is used; on repeated rate
// limits / outages / invalid output the next one takes over.
//
// Model strings are "<provider>:<model id>":
//   gemini:<id>      Google AI Studio (free tier), native SDK — reads PDFs and images
//   openrouter:<id>  OpenRouter — only ":free" model ids are allowed (enforced below)
//
// Gemini IDs must match the project's own ListModels output: run
// `npm run check:gemini` (seed/check-gemini.ts). Verification date in DECISIONS.md (T8).

export type ModelTask = "extraction" | "copilot" | "analysis" | "followup" | "ping";

export const GEMINI_FLASH = "gemini:gemini-3.8-flash"; // verified via ListModels + ping, 2026-09-30
// Newest Flash (3.8) returned 503 "high demand" on most calls on 2026-09-30;
// 3.6 Flash answered reliably, so it sits between 3.8 and Flash-Lite.
export const GEMINI_FLASH_STABLE = "gemini:gemini-3.6-flash"; // verified via ListModels + ping, 2026-09-30
export const GEMINI_FLASH_LITE = "gemini:gemini-3.5-flash-lite"; // verified via ListModels + ping, 2026-09-30
export const NEMOTRON_FREE = "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free";

export interface ModelRoute {
  chain: string[];
  timeoutMs: number;
}

export const MODELS: Record<ModelTask, ModelRoute> = {
  extraction: { chain: [GEMINI_FLASH, GEMINI_FLASH_STABLE, GEMINI_FLASH_LITE], timeoutMs: 240_000 },
  analysis: { chain: [GEMINI_FLASH, GEMINI_FLASH_STABLE, GEMINI_FLASH_LITE, NEMOTRON_FREE], timeoutMs: 120_000 },
  copilot: { chain: [NEMOTRON_FREE, GEMINI_FLASH_LITE], timeoutMs: 120_000 },
  followup: { chain: [NEMOTRON_FREE, GEMINI_FLASH_LITE], timeoutMs: 60_000 },
  ping: { chain: [GEMINI_FLASH, NEMOTRON_FREE], timeoutMs: 45_000 },
};

export function assertFree(model: string) {
  if (!model.startsWith("gemini:") && !(model.startsWith("openrouter:") && model.endsWith(":free"))) {
    throw new Error(`Refusing to call ${model}: only Gemini free-tier and OpenRouter ":free" models are allowed.`);
  }
}

export const displayModel = (m: string) => m.replace(/^(gemini|openrouter):/, "");
