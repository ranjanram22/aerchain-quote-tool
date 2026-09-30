import "server-only";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { chat, type StatusFn } from "../llm";
import { displayModel } from "../models";
import { loadComparison } from "../rfx-data";
import { TOOL_SCHEMAS, runTool, type Ctx, type ToolResult } from "./tools";
import type { Answer, ChatTurn, MethodStep, AnswerTable, AnswerChart } from "./types";

// Capped to keep each question within free-tier rate limits.
const MAX_TOOL_CALLS = 6;

const SYSTEM = `You are a senior procurement analyst helping a buyer decide an award on one RFx. You answer questions using ONLY the tools provided.

Hard rules:
- Never compute, estimate or invent a number. Every number you write must appear in a tool result from this conversation turn (you may round it or show it in lakh/crore). If you need a number no tool gives, say what data is missing.
- Always state coverage (how many lines a total covers). Never compare totals with different coverage without saying so; prefer like-for-like totals.
- Surface quality and compliance next to price (mandatory questionnaire items, expired certificates, spec deviations).
- Spec deviations are excluded by default; conditional discounts are only applied if the buyer confirmed them — use what_if to show the effect either way.
- "Compliant" / "quality-compliant" / "passes mandatory" means vendor_filter.must_pass = "all_mandatory".
- Use basis "unit_price" unless the buyer mentions freight, landed, delivered or total cost; then use "landed". Say which basis you used.
- Do not state counts or facts that are not in tool results.
- If the question is genuinely ambiguous, ask one short clarifying question; otherwise state your assumption and proceed.
- Use make_chart only when a chart genuinely helps (comparisons across vendors or categories).

Final answer: after your tool calls, reply with ONLY a JSON object:
{"text": "<concise answer in plain language, ≤ 180 words, may use short bullet lines starting with '- '>", "show_tables": ["<table_id>", ...], "show_charts": ["<chart_id>", ...], "caveats": ["<extra caveat>", ...]}
Show the 1–2 most useful tables. Do not repeat whole tables in text.`;

function parseFinal(txt: string): { text: string; show_tables: string[]; show_charts: string[]; caveats: string[] } {
  const t = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    return { text: String(j.text ?? ""), show_tables: Array.isArray(j.show_tables) ? j.show_tables : [], show_charts: Array.isArray(j.show_charts) ? j.show_charts : [], caveats: Array.isArray(j.caveats) ? j.caveats.map(String) : [] };
  } catch {
    return { text: t, show_tables: [], show_charts: [], caveats: [] };
  }
}

// ---------- number post-check ----------
function numbersInText(text: string): { raw: string; value: number; unit: string }[] {
  const out: { raw: string; value: number; unit: string }[] = [];
  const re = /(₹|rs\.?\s*|inr\s*|usd\s*|\$)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crore|cr\b|lakh|lakhs|l\b|k\b|%|x\b|×)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    const u = (m[3] ?? "").toLowerCase();
    out.push({ raw: m[0].trim(), value: v, unit: u });
  }
  return out;
}

function collectNumbers(x: unknown, acc: number[]) {
  if (typeof x === "number" && Number.isFinite(x)) acc.push(x);
  else if (typeof x === "string") for (const n of x.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []) acc.push(Number(n.replace(/,/g, "")));
  else if (Array.isArray(x)) x.forEach((y) => collectNumbers(y, acc));
  else if (x && typeof x === "object") Object.values(x).forEach((y) => collectNumbers(y, acc));
}

function checkNumbers(text: string, pool: number[], question: string): string[] {
  const q: number[] = [];
  collectNumbers(question, q);
  const all = [...pool, ...q];
  const abs = all.map(Math.abs);
  const close = (a: number, b: number) => (b === 0 ? a === 0 : Math.abs(a - b) / Math.abs(b) <= 0.006 || Math.abs(a - b) < 0.011);
  const bad: string[] = [];
  for (const n of numbersInText(text)) {
    const v = n.value;
    if (v <= 31 && Number.isInteger(v) && !n.unit) continue; // line numbers, counts, days
    if (v >= 1900 && v <= 2100 && Number.isInteger(v)) continue; // years
    const scales = n.unit === "crore" || n.unit === "cr" ? [1e7] : n.unit === "lakh" || n.unit === "lakhs" || n.unit === "l" ? [1e5] : n.unit === "k" ? [1e3] : [1];
    const cand = scales.map((s) => v * s);
    const ok = cand.some((c) => abs.some((p) => close(c, p) || (scales[0] > 1 && Math.abs(c - p) / p <= 0.01)));
    if (!ok) bad.push(n.raw);
  }
  return [...new Set(bad)];
}

export async function answerQuestion(rfxId: string, question: string, history: ChatTurn[], onStatus?: StatusFn): Promise<Answer> {
  const { bundle, cmp } = await loadComparison(rfxId);
  let tid = 0;
  const ctx: Ctx = { bundle, cmp, tables: new Map(), nextTableId: () => `T${++tid}` };
  const categories = [...new Set(bundle.lines.map((l) => l.category))].join(", ");
  const context = `RFx: ${bundle.rfx.title} (${bundle.lines.length} lines; categories: ${categories}). Invited vendors: ${bundle.vendors.map((v) => v.name).join(", ")}. Questionnaire codes: ${bundle.questions.map((q) => `${q.code}${q.requirement.mandatory || q.requirement.must ? " (mandatory)" : ""}`).join(", ")}.`;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: `${SYSTEM}\n\n${context}` },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }) as ChatCompletionMessageParam),
    { role: "user", content: question },
  ];
  const method: MethodStep[] = [];
  const results: ToolResult[] = [];
  let calls = 0;
  let model: string | null = null;
  let finalText = "";

  for (let round = 0; round < 10; round++) {
    const force = calls >= MAX_TOOL_CALLS;
    const r = await chat("analysis", { messages, tools: force ? undefined : TOOL_SCHEMAS, tool_choice: force ? undefined : "auto", max_tokens: 8000, temperature: 0.1 }, { onStatus });
    model = displayModel(r.model);
    const msg = r.completion.choices[0]?.message;
    const toolCalls = (msg?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
    if (!toolCalls.length) { finalText = msg?.content ?? ""; break; }
    messages.push({ role: "assistant", content: msg?.content ?? "", tool_calls: toolCalls });
    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      calls++;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* keep empty */ }
      onStatus?.(`Running ${tc.function.name.replace(/_/g, " ")}…`);
      const res = calls > MAX_TOOL_CALLS ? ({ summary: "skipped (tool budget reached)", data: { error: "Tool budget reached; answer with what you have." } } as ToolResult) : runTool(ctx, tc.function.name, args);
      if (calls <= MAX_TOOL_CALLS) { results.push(res); method.push({ tool: tc.function.name, params: args, summary: res.summary }); }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(res.data).slice(0, 24000) });
    }
  }

  const pool: number[] = [];
  results.forEach((r) => { collectNumbers(r.data, pool); r.tables.forEach((t) => collectNumbers(t.rows, pool)); });
  let final = parseFinal(finalText);
  let unverified = checkNumbers(final.text, pool, question);
  let regenerated = false;
  if (unverified.length) {
    regenerated = true;
    messages.push({ role: "assistant", content: finalText });
    messages.push({ role: "user", content: `These numbers in your answer do not appear in any tool result: ${unverified.join(", ")}. Rewrite the answer using only numbers from tool results (or omit them). Return the same JSON format.` });
    onStatus?.("Re-checking numbers against the calculations…");
    const r2 = await chat("analysis", { messages, max_tokens: 6000, temperature: 0 }, { onStatus });
    final = parseFinal(r2.completion.choices[0]?.message?.content ?? "");
    unverified = checkNumbers(final.text, pool, question);
  }

  const allTables: AnswerTable[] = results.flatMap((r) => r.tables);
  const allCharts: AnswerChart[] = [...new Map(results.flatMap((r) => r.charts).map((c) => [c.id, c])).values()];
  let tables = allTables.filter((t) => final.show_tables.includes(t.id));
  if (!tables.length && allTables.length) tables = allTables.slice(0, 1);
  const charts = allCharts.filter((c) => final.show_charts.includes(c.id) || !final.show_charts.length);
  const keys = [...new Set(results.flatMap((r) => r.open_item_keys))];
  const open_item_refs = bundle.openItems
    .filter((i) => i.status === "open" && i.key && keys.includes(i.key))
    .map((i) => ({ id: i.id, key: i.key!, kind: (i.details as { subkind?: string } | null)?.subkind ?? i.kind, message: i.message, vendor: bundle.vendors.find((v) => v.id === i.vendor_id)?.name ?? null }));
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    text: final.text || "I couldn't produce an answer. Please rephrase the question.",
    tables,
    charts,
    method,
    included: uniq(results.flatMap((r) => r.included)),
    excluded: uniq(results.flatMap((r) => r.excluded)),
    caveats: uniq([...results.flatMap((r) => r.caveats), ...final.caveats]),
    open_item_refs,
    model,
    numbers_check: { ok: unverified.length === 0, unverified, regenerated },
  };
}
