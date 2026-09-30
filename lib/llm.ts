import "server-only";
import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { MODELS, assertFree, displayModel, type ModelTask } from "./models";
import { geminiChat, geminiRetryDelay, GeminiApiError } from "./gemini";
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
  assertFree(model);
  const started = Date.now();
  try {
    let completion: ChatCompletion;
    if (model.startsWith("gemini:")) completion = await geminiChat(model.slice(7), params, timeoutMs);
    else {
      completion = await orClient().chat.completions.create({ ...params, model: model.slice("openrouter:".length), stream: false }, { timeout: timeoutMs });
      const e = (completion as unknown as { error?: { message?: string; code?: number } }).error;
      if (e) throw new OpenAI.APIError(e.code ?? 502, e, e.message ?? "Upstream error", undefined);
    }
    const latencyMs = Date.now() - started;
    await logCall({ task, model, latency_ms: latencyMs, input_tokens: completion.usage?.prompt_tokens ?? null, output_tokens: completion.usage?.completion_tokens ?? null, ok: true });
    return { completion, model, latencyMs };
  } catch (err) {
    await logCall({ task, model, latency_ms: Date.now() - started, ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const chain = opts.models ?? MODELS[task].chain;
  const timeoutMs = opts.timeoutMs ?? MODELS[task].timeoutMs;
  let last: unknown;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      try {
        return await attempt(task, model, params, timeoutMs);
      } catch (err) {
        last = err;
        if (!isRetryable(err)) break; // e.g. bad request → try the next model
        const hinted = geminiRetryDelay(err);
        if (tryNo === 2 || (hinted != null && hinted > 20)) break; // long wait requested → switch model now
        const wait = Math.min(20, hinted ?? [2, 6][tryNo]) * 1000;
        opts.onStatus?.(`${isRateLimit(err) ? "AI busy (rate limit)" : "AI not responding"} on ${displayModel(model)} — retrying in ${Math.round(wait / 1000)}s…`);
        await sleep(wait);
      }
    }
    if (i + 1 < chain.length) opts.onStatus?.(`Switching to backup model ${displayModel(chain[i + 1])}…`);
  }
  throw friendly(last);
}

export function textOf(result: ChatResult): string {
  return result.completion.choices[0]?.message?.content ?? "";
}
