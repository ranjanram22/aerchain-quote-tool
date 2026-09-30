import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { MODELS, type ModelTask } from "./models";
import { db, isSupabaseConfigured } from "./supabase";

// One wrapper for every LLM call: timeout, one retry with backoff on 429/5xx,
// then the task's fallback model. Every attempt is logged to `llm_calls`.

let openrouter: OpenAI | null = null;

function client(): OpenAI {
  if (openrouter) return openrouter;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
  openrouter = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    maxRetries: 0, // retries are handled below so each attempt gets logged
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/aerchain-quote-tool",
      "X-Title": "Aerchain Quote Tool",
    },
  });
  return openrouter;
}

export type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model" | "stream">;

export interface ChatResult {
  completion: ChatCompletion;
  model: string;
  latencyMs: number;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    const s = err.status ?? 0;
    return s === 429 || s >= 500;
  }
  // Timeouts and network failures
  return err instanceof OpenAI.APIConnectionError;
}

async function logCall(row: {
  task: string;
  model: string;
  latency_ms: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  ok: boolean;
  error?: string | null;
}) {
  if (!isSupabaseConfigured()) return;
  try {
    await db().from("llm_calls").insert(row);
  } catch {
    // Logging must never break the request.
  }
}

async function attempt(task: ModelTask, model: string, params: ChatParams, timeoutMs: number): Promise<ChatResult> {
  const started = Date.now();
  try {
    const completion = await client().chat.completions.create(
      { ...params, model, stream: false },
      { timeout: timeoutMs },
    );
    // OpenRouter can return 200 with an error body.
    const maybeError = (completion as unknown as { error?: { message?: string; code?: number } }).error;
    if (maybeError) {
      throw new OpenAI.APIError(maybeError.code ?? 502, maybeError, maybeError.message ?? "Upstream error", undefined);
    }
    const latencyMs = Date.now() - started;
    await logCall({
      task,
      model: completion.model || model,
      latency_ms: latencyMs,
      input_tokens: completion.usage?.prompt_tokens ?? null,
      output_tokens: completion.usage?.completion_tokens ?? null,
      ok: true,
    });
    return { completion, model: completion.model || model, latencyMs };
  } catch (err) {
    await logCall({
      task,
      model,
      latency_ms: Date.now() - started,
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    });
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(
  task: ModelTask,
  params: ChatParams,
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<ChatResult> {
  const route = MODELS[task];
  const primary = opts.model ?? route.model;
  const timeoutMs = opts.timeoutMs ?? route.timeoutMs;

  try {
    return await attempt(task, primary, params, timeoutMs);
  } catch (err) {
    if (!isRetryable(err)) throw err;
  }
  await sleep(1500);
  try {
    return await attempt(task, primary, params, timeoutMs);
  } catch (err) {
    if (!isRetryable(err) || route.fallback === primary) throw err;
  }
  return attempt(task, route.fallback, params, timeoutMs);
}

export function textOf(result: ChatResult): string {
  return result.completion.choices[0]?.message?.content ?? "";
}
