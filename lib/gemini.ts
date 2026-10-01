import "server-only";
import { GoogleGenAI, ApiError, type Content, type Part, type FunctionDeclaration, type ThinkingLevel } from "@google/genai";
import type { ChatCompletion, ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ChatParams } from "./llm";

// Adapter: accepts the OpenAI-style request the rest of the app builds and
// calls Gemini through its native SDK (inline PDFs and images supported),
// returning an OpenAI-shaped completion. Gemini "thought signatures" on
// function calls are kept in memory so multi-turn tool use works within a
// request. Tool calls made by a non-Gemini model earlier in the same
// conversation (fallback chain) have no signature, so they are replayed as
// plain-text summaries instead of functionCall parts (DECISIONS T9).
//
// geminiStream() is the native streaming path used by the co-pilot, which
// keeps its own history in Gemini's format (lib/copilot.ts).

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  client = new GoogleGenAI({ apiKey });
  return client;
}

const callParts = new Map<string, Part>(); // tool_call id → original Gemini part (with thoughtSignature)
let seq = 0;

function dataUrl(u: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(u);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

function toContents(messages: ChatCompletionMessageParam[]): { system: string; contents: Content[] } {
  const system: string[] = [];
  const contents: Content[] = [];
  const nameById = new Map<string, string>();
  const foreign = new Set<string>(); // tool_call ids with no Gemini part (made by another provider)
  const push = (role: "user" | "model", parts: Part[]) => {
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts!.push(...parts);
    else contents.push({ role, parts });
  };
  for (const m of messages) {
    if (m.role === "system" || m.role === "developer") {
      system.push(typeof m.content === "string" ? m.content : m.content.map((p) => ("text" in p ? p.text : "")).join("\n"));
    } else if (m.role === "user") {
      if (typeof m.content === "string") push("user", [{ text: m.content }]);
      else {
        const parts: Part[] = [];
        for (const p of m.content) {
          if (p.type === "text") parts.push({ text: p.text });
          else if (p.type === "image_url") {
            const d = dataUrl(p.image_url.url);
            if (d) parts.push({ inlineData: d });
          } else if (p.type === "file") {
            const d = p.file.file_data ? dataUrl(p.file.file_data) : null;
            if (d) parts.push({ inlineData: d });
          }
        }
        push("user", parts);
      }
    } else if (m.role === "assistant") {
      const parts: Part[] = [];
      const text = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((p) => ("text" in p ? p.text : "")).join("") : "";
      if (text) parts.push({ text });
      for (const tc of m.tool_calls ?? []) {
        if (tc.type !== "function") continue;
        nameById.set(tc.id, tc.function.name);
        const orig = callParts.get(tc.id);
        if (orig) parts.push(orig);
        else {
          foreign.add(tc.id);
          parts.push({ text: `[Earlier step: called ${tc.function.name} with ${tc.function.arguments || "{}"}]` });
        }
      }
      if (parts.length) push("model", parts);
    } else if (m.role === "tool") {
      const raw = typeof m.content === "string" ? m.content : m.content.map((p) => p.text).join("");
      if (foreign.has(m.tool_call_id)) {
        push("user", [{ text: `[Result of ${nameById.get(m.tool_call_id) ?? "tool"}: ${raw}]` }]);
        continue;
      }
      let response: Record<string, unknown>;
      try {
        const j = JSON.parse(raw);
        response = j && typeof j === "object" && !Array.isArray(j) ? j : { result: j };
      } catch {
        response = { result: raw };
      }
      push("user", [{ functionResponse: { name: nameById.get(m.tool_call_id) ?? "tool", response } }]);
    }
  }
  return { system: system.join("\n\n"), contents };
}

function toDeclarations(tools: ChatCompletionTool[] | undefined): FunctionDeclaration[] | undefined {
  if (!tools?.length) return undefined;
  return tools
    .filter((t) => t.type === "function")
    .map((t) => ({ name: t.function.name, description: t.function.description, parametersJsonSchema: t.function.parameters ?? { type: "object", properties: {} } }));
}

export async function geminiChat(modelId: string, params: ChatParams, timeoutMs: number): Promise<ChatCompletion> {
  const { system, contents } = toContents(params.messages);
  const decls = toDeclarations(params.tools as ChatCompletionTool[] | undefined);
  const wantsJson = (params.response_format as { type?: string } | undefined)?.type === "json_object";
  const res = await gemini().models.generateContent({
    model: modelId,
    contents,
    config: {
      systemInstruction: system || undefined,
      temperature: params.temperature ?? undefined,
      maxOutputTokens: (params.max_tokens as number | undefined) ?? undefined,
      responseMimeType: wantsJson && !decls ? "application/json" : undefined,
      tools: decls ? [{ functionDeclarations: decls }] : undefined,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  const cand = res.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  const tool_calls = parts
    .filter((p) => p.functionCall)
    .map((p) => {
      const id = `gem_${Date.now().toString(36)}_${++seq}`;
      callParts.set(id, p);
      if (callParts.size > 5000) callParts.delete(callParts.keys().next().value!);
      return { id, type: "function" as const, function: { name: p.functionCall!.name ?? "", arguments: JSON.stringify(p.functionCall!.args ?? {}) } };
    });
  if (!parts.length) {
    const reason = cand?.finishReason ?? res.promptFeedback?.blockReason ?? "empty response";
    throw new ApiError({ message: `Gemini returned no content (${reason})`, status: 502 });
  }
  return {
    id: res.responseId ?? `gem_${seq}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: res.modelVersion ?? modelId,
    choices: [{ index: 0, finish_reason: tool_calls.length ? "tool_calls" : "stop", logprobs: null, message: { role: "assistant", content: text || null, refusal: null, ...(tool_calls.length ? { tool_calls } : {}) } }],
    usage: { prompt_tokens: res.usageMetadata?.promptTokenCount ?? 0, completion_tokens: (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0), total_tokens: res.usageMetadata?.totalTokenCount ?? 0 },
  } as ChatCompletion;
}

export interface GeminiTurn {
  parts: Part[]; // every part exactly as streamed, thought signatures included
  text: string; // visible text (non-thought)
  calls: { name: string; args: Record<string, unknown> }[];
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

// Native streaming call. Text deltas go to onDelta as they arrive; the parts
// are returned unmerged and unmodified so they can be replayed later.
export async function geminiStream(
  modelId: string,
  req: { system: string; contents: Content[]; tools?: FunctionDeclaration[]; thinkingLevel?: ThinkingLevel; temperature?: number; maxOutputTokens?: number },
  timeoutMs: number,
  onDelta?: (text: string) => void,
): Promise<GeminiTurn> {
  const stream = await gemini().models.generateContentStream({
    model: modelId,
    contents: req.contents,
    config: {
      systemInstruction: req.system,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      tools: req.tools?.length ? [{ functionDeclarations: req.tools }] : undefined,
      thinkingConfig: req.thinkingLevel ? { thinkingLevel: req.thinkingLevel } : undefined,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  const parts: Part[] = [];
  let finishReason: string | null = null;
  let usage: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;
  for await (const chunk of stream) {
    const cand = chunk.candidates?.[0];
    for (const p of cand?.content?.parts ?? []) {
      parts.push(p);
      if (p.text && !p.thought) onDelta?.(p.text);
    }
    if (cand?.finishReason) finishReason = cand.finishReason;
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
  }
  const visible = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  const calls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall!.name ?? "", args: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
  if (!visible.trim() && !calls.length) throw new ApiError({ message: `Gemini returned no content (${finishReason ?? "empty response"})`, status: 502 });
  return {
    parts, text: visible, calls, finishReason,
    inputTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage ? (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) : null,
  };
}

// Seconds the API asks us to wait (from a 429's RetryInfo), if present.
export function geminiRetryDelay(err: unknown): number | null {
  const m = /retry(?:Delay)?["\s:]*"?(\d+(?:\.\d+)?)s/i.exec(err instanceof Error ? err.message : String(err));
  return m ? Number(m[1]) : null;
}

export { ApiError as GeminiApiError };

export async function listGeminiModels() {
  const out: { name: string; displayName?: string; actions?: string[]; inputTokenLimit?: number }[] = [];
  const pager = await gemini().models.list();
  for await (const m of pager) out.push({ name: m.name ?? "", displayName: m.displayName, actions: m.supportedActions, inputTokenLimit: m.inputTokenLimit });
  return out;
}
