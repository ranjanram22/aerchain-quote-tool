import "server-only";
import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { MODELS, assertFree, displayModel, type ModelTask } from "./models";
import { geminiChat, geminiRetryDelay, GeminiApiError, type GeminiTurn } from "./gemini";
import { db, isSupabaseConfigured } from "./supabase";

// One wrapper for every LLM call (free models only):
// - per-task chain of models (lib/models.ts);
// - on 429 / 5xx / timeouts: back off and retry the same model (up to 2 more
//   times, honouring the provider's retry delay when it is short), then switch
//   to the next model in the chain;
// - every attempt is logged to `llm_calls`;
// - optional onStatus callback so the UI can show "busy, retrying".

export type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model" | "stream">;
export type StatusFn = (message: string) => void;

export interface ChatResult {
  completion: ChatCompletion;
  model: string;
  latencyMs: number;
}

let openrouter: OpenAI | null = null;
function orClient(): OpenAI {
  if (openrouter) return openrouter;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  openrouter = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", maxRetries: 0, defaultHeaders: { "X-Title": "Aerchain Quote Tool" } });
  return openrouter;
}

function statusOf(err: unknown): number {
  if (err instanceof OpenAI.APIError) return err.status ?? 0;
  if (err instanceof GeminiApiError) return err.status ?? 0;
  const s = (err as { status?: number })?.status;
  return typeof s === "number" ? s : 0;
}
function isTimeout(err: unknown) {
  return err instanceof OpenAI.APIConnectionError || (err instanceof Error && /abort|timeout|timed out|fetch failed|ECONNRESET/i.test(err.name + err.message));
}
const isRateLimit = (err: unknown) => statusOf(err) === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(err instanceof Error ? err.message : "");
const isRetryable = (err: unknown) => isRateLimit(err) || statusOf(err) >= 500 || isTimeout(err);

async function logCall(row: { task: string; model: string; latency_ms: number; input_tokens?: number | null; output_tokens?: number | null; ok: boolean; error?: string | null }) {
  if (!isSupabaseConfigured()) return;
  try { await db().from("llm_calls").insert(row); } catch { /* never break the request */ }
}

async function attempt(task: ModelTask, model: string, params: ChatParams, timeoutMs: number): Promise<ChatResult> {
  const started = Date.now();
  const completion = await logged(task, model, async () => {
    let c: ChatCompletion;
    if (model.startsWith("gemini:")) c = await geminiChat(model.slice(7), params, timeoutMs);
    else {
      c = await orClient().chat.completions.create({ ...params, model: model.slice("openrouter:".length), stream: false }, { timeout: timeoutMs });
      const e = (c as unknown as { error?: { message?: string; code?: number } }).error;
      if (e) throw new OpenAI.APIError(e.code ?? 502, e, e.message ?? "Upstream error", undefined);
    }
    return { value: c, inputTokens: c.usage?.prompt_tokens, outputTokens: c.usage?.completion_tokens };
  });
  return { completion, model, latencyMs: Date.now() - started };
}

// Runs one model call, enforcing the free-models rule and logging it to llm_calls.
async function logged<T>(task: ModelTask, model: string, call: () => Promise<{ value: T; inputTokens?: number | null; outputTokens?: number | null }>): Promise<T> {
  assertFree(model);
  const started = Date.now();
  try {
    const r = await call();
    await logCall({ task, model, latency_ms: Date.now() - started, input_tokens: r.inputTokens ?? null, output_tokens: r.outputTokens ?? null, ok: true });
    return r.value;
  } catch (err) {
    await logCall({ task, model, latency_ms: Date.now() - started, ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cool-down: a model that just hit a rate limit / overload is skipped for a
// few minutes (per server instance) so each request doesn't re-discover it.
const coolUntil = new Map<string, number>();
const COOL_MS = 3 * 60_000;

function friendly(err: unknown): Error {
  const s = statusOf(err);
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (isRateLimit(err)) return new Error("The free AI models are busy right now (rate limit). Please try again in a minute.");
  if (s === 402 || (s === 403 && m.includes("limit")) || m.includes("credit")) return new Error("The AI service refused the request because of a usage limit. Existing data stays available; try again later.");
  if (s === 401 || (s === 400 && m.includes("api key")) || m.includes("api_key_invalid")) return new Error("The AI service rejected the API key. The administrator needs to check GEMINI_API_KEY / OPENROUTER_API_KEY.");
  if (isTimeout(err)) return new Error("The AI service took too long to answer. Please try again.");
  return err instanceof Error ? err : new Error(String(err));
}

export async function chat(
  task: ModelTask,
  params: ChatParams,
  opts: { models?: string[]; timeoutMs?: number; onStatus?: StatusFn } = {},
): Promise<ChatResult> {
  const timeoutMs = opts.timeoutMs ?? MODELS[task].timeoutMs;
  return withChain(task, opts.models ?? MODELS[task].chain, opts.onStatus, (model) => attempt(task, model, params, timeoutMs));
}

// Model chain with retry / back-off / cool-down / fallback around any call.
// `call` gets the model chosen for this attempt; `onRetry` runs before each
// new attempt (e.g. so a streaming UI can discard partial text).
export async function withChain<T>(
  task: ModelTask,
  chain: string[],
  onStatus: StatusFn | undefined,
  call: (model: string) => Promise<T>,
  onRetry?: () => void,
): Promise<T> {
  let last: unknown;
  let first = true;
  const now = Date.now();
  // Skip cooling models unless every model in the chain is cooling.
  const usable = chain.filter((m) => (coolUntil.get(m) ?? 0) <= now);
  const order = usable.length ? usable : chain;
  for (let i = 0; i < order.length; i++) {
    const model = order[i];
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      try {
        if (!first) onRetry?.();
        first = false;
        return await call(model);
      } catch (err) {
        last = err;
        if (!isRetryable(err)) break; // e.g. bad request → try the next model
        if (isRateLimit(err) || statusOf(err) === 503) coolUntil.set(model, Date.now() + COOL_MS);
        const hinted = geminiRetryDelay(err);
        const overloaded = statusOf(err) === 503 || /high demand|overloaded|UNAVAILABLE/i.test(err instanceof Error ? err.message : "");
        // Long requested wait, or provider-side overload after one retry → switch model now.
        if (tryNo === 2 || (hinted != null && hinted > 20) || (overloaded && tryNo >= 1)) break;
        const wait = Math.max(1, Math.min(20, hinted ?? [2, 6][tryNo])) * 1000;
        onStatus?.(`${isRateLimit(err) ? "AI busy (rate limit)" : "AI not responding"} on ${displayModel(model)} — retrying in ${Math.round(wait / 1000)}s…`);
        await sleep(wait);
      }
    }
    if (i + 1 < order.length) onStatus?.(`Switching to backup model ${displayModel(order[i + 1])}…`);
  }
  throw friendly(last);
}

// Same chain handling for a native Gemini streaming call (co-pilot).
export function geminiStreamChain(
  task: ModelTask,
  run: (modelId: string, model: string) => Promise<GeminiTurn>,
  opts: { models?: string[]; onStatus?: StatusFn; onRetry?: () => void } = {},
): Promise<GeminiTurn & { model: string }> {
  const chain = opts.models ?? MODELS[task].chain;
  return withChain(task, chain, opts.onStatus, (model) => {
    if (!model.startsWith("gemini:")) throw new Error(`${model} is not a Gemini model; the ${task} chain must be Gemini-only.`);
    return logged(task, model, async () => {
      const r = await run(model.slice(7), model);
      return { value: { ...r, model }, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    });
  }, opts.onRetry);
}

export function textOf(result: ChatResult): string {
  return result.completion.choices[0]?.message?.content ?? "";
}
