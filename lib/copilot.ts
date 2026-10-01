import "server-only";
import type { Content, Part, FunctionDeclaration, ThinkingLevel } from "@google/genai";
import { geminiStreamChain, type StatusFn } from "./llm";
import { geminiStream } from "./gemini";
import { MODELS, displayModel, lowestThinkingLevel } from "./models";
import { db } from "./supabase";
import { loadDraft, catalogIndex, updateDraft, type Draft, type CatalogItem, type DraftChanges } from "./draft";

// RFx co-pilot. Gemini only, called natively with streaming. The conversation
// is stored in `copilot_messages` in Gemini's own format: every model part is
// saved exactly as returned (thought signatures included) and replayed as is,
// so multi-turn tool use survives page reloads and server restarts.
// DECISIONS T9 (signatures) and T10 (speed: one update_draft tool, catalog in
// the prompt, Flash-Lite at minimal thinking, streamed text).

const SYSTEM = `You are an RFx co-pilot for an industrial buyer. You help draft a request for quotation (RFx) by conversation and record everything in the draft with the update_draft tool. The draft is shown live next to the chat.

How to work:
- Only two things are required to publish: at least one line item and the response deadline. Everything else is optional: title, delivery location, scope, quantities, questionnaire, and terms such as offer validity, payment terms, delivery terms/Incoterm, freight, GST treatment and currency. Vendors' prices are assumed to include GST unless the buyer says otherwise.
- Record facts as soon as the buyer gives them; do not wait for everything. Put ALL changes for a message into ONE update_draft call. After it, reply briefly with what you recorded. If the response deadline is still missing, ask for it. Do not ask for or chase optional details; at most mention once that they can be added.
- You may give the draft a short title from the items when the buyer has not named it.
- When the buyer names items, reuse a catalog product only if it matches what the buyer said (same type, ply, dimensions and print); pass its catalog_ref and the specification is copied automatically. If anything differs, do not use catalog_ref: add a line with the buyer's own specification in a spec object (e.g. type, ply, flute, paper_gsm, bf, dimensions_mm, print, notes). Write descriptions in the buyer's terms.
- When the buyer pastes a list (rows from a spreadsheet or an email), add every row. Keep the buyer's quantities and units exactly; if a row has no quantity or unit, leave it empty and say so.
- Units: use "piece", "set", "kg", "box", "m", "sqm", "litre" etc.
- Never record a quantity, price, date or commercial term the buyer did not state. Do not suggest optional terms unless the buyer asks. Draft a questionnaire only when the buyer asks for one (then suggest 10–15 standard supplier questions for the category and mark the truly mandatory ones).
- Corrections: update_lines / remove_lines with the line numbers shown in the current draft.
- Only say something was recorded if the update_draft result lists it; report anything that failed.
- If the buyer only asks a question, answer it without calling the tool.
- Keep replies short and plain: plain text, no markdown (no ** or #); simple "-" bullets are fine.`;

const lineProps = {
  description: { type: "string" }, category: { type: "string" }, unit: { type: "string" }, annual_qty: { type: "number" },
  catalog_ref: { type: "string", description: "Catalog ref (e.g. C3) when the item matches a catalog product" },
  spec: { type: "object", description: "Specification key/values (only for non-catalog items, or to override catalog values)" },
};

const UPDATE_DRAFT: FunctionDeclaration = {
  name: "update_draft",
  description: "Apply all changes to the RFx draft in one call. Include only the sections that change. Line numbers refer to the current draft.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      header: { type: "object", properties: { title: { type: "string" }, category: { type: "string" }, location: { type: "string" }, scope: { type: "string" } } },
      terms: { type: "object", description: "Merged into existing terms", properties: {
        response_deadline: { type: "string", description: "YYYY-MM-DD" }, validity_required_days: { type: "integer" }, payment_terms: { type: "string" }, delivery_terms: { type: "string" },
        incoterm: { type: "string" }, freight_expectation: { type: "string" }, gst_treatment: { type: "string" }, currency: { type: "string" }, contract_period: { type: "string" },
      } },
      add_lines: { type: "array", items: { type: "object", properties: lineProps, description: "Each line needs a description or a catalog_ref" } },
      update_lines: { type: "array", items: { type: "object", properties: { line_no: { type: "integer" }, ...lineProps }, required: ["line_no"] } },
      remove_lines: { type: "array", items: { type: "integer" }, description: "Line numbers to remove" },
      questionnaire: { type: "array", description: "Replaces the whole questionnaire", items: { type: "object", properties: {
        text: { type: "string" }, code: { type: "string", description: "short snake_case key, e.g. iso9001" }, mandatory: { type: "boolean" },
        type: { type: "string", enum: ["boolean", "min", "max", "text"] }, value: { type: "number", description: "threshold for min/max" }, unit: { type: "string" },
        evidence: { type: "string", enum: ["certificate", "gstin"], description: "document that proves the answer, if any" },
      }, required: ["text"] } },
    },
  },
};

const MAX_ROUNDS = 4;
const MAX_TURNS_REPLAYED = 20;

export interface StoredMessage {
  seq: number;
  turn: number;
  role: "user" | "model";
  kind: "buyer" | "model" | "tool_result";
  parts: Part[];
  model: string | null;
  meta: { actions?: string[] } & Record<string, unknown>;
}

function snapshot(d: Draft) {
  return JSON.stringify({
    title: d.rfx.title, category: d.rfx.category, location: d.rfx.location, scope: d.rfx.scope, terms: d.rfx.terms,
    lines: d.lines.map((l) => ({ line_no: l.line_no, description: l.description, unit: l.unit, annual_qty: l.annual_qty, spec: l.spec })),
    questionnaire: d.questions.map((q) => ({ q_no: q.q_no, text: q.text, mandatory: (q.requirement as { mandatory?: boolean })?.mandatory })),
  });
}

function systemFor(d: Draft, catalog: CatalogItem[]) {
  const cat = catalog.map((p) => `${p.ref}: ${p.name} (${p.base_unit}) ${Object.entries(p.spec).map(([k, v]) => `${k}=${v}`).join("; ")}`).join("\n");
  return `${SYSTEM}\n\nToday is ${new Date().toISOString().slice(0, 10)}.\n\nProduct catalog:\n${cat || "(empty)"}\n\nCurrent draft (JSON):\n${snapshot(d)}`;
}

const isGemini = (m: string | null) => !!m && m.startsWith("gemini:");
const stripSig = ({ thoughtSignature, ...p }: Part): Part => { void thoughtSignature; return p; };

// Builds the request history from stored rows (pure; exported for tests).
// Gemini turns are replayed exactly as returned, signatures included — also
// after a switch between Gemini models, as Google's thinking guide asks
// ("resend the previous model's thought blocks; the backend manages
// compatibility"). Tool calls without a usable signature (made by a non-Gemini
// model in old history, or a Gemini call that somehow lost its signature) are
// never sent as functionCall parts: they become plain-text summaries, and so do
// their results. The same applies to a call whose result was never saved (a
// turn that failed half-way), since Gemini rejects a call without a response.
export function toRequestContents(rows: StoredMessage[]): Content[] {
  const firstTurn = [...new Set(rows.filter((r) => r.kind === "buyer").map((r) => r.turn))].slice(-MAX_TURNS_REPLAYED)[0];
  const out: Content[] = [];
  let textifyResults = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (firstTurn != null && r.turn < firstTurn) continue;
    let parts: Part[];
    if (r.kind === "model") {
      const hasCalls = r.parts.some((p) => p.functionCall);
      const answered = rows[i + 1]?.kind === "tool_result";
      const replayable = isGemini(r.model) && (!hasCalls || (answered && r.parts.some((p) => p.functionCall && p.thoughtSignature)));
      textifyResults = hasCalls && !replayable;
      parts = replayable ? r.parts : r.parts.flatMap((p): Part[] => {
        if (p.functionCall) return [{ text: `[Earlier step: called ${p.functionCall.name} with ${JSON.stringify(p.functionCall.args ?? {})}]` }];
        if (p.thought) return [];
        return p.text ? [stripSig(p)] : [];
      });
    } else if (r.kind === "tool_result" && textifyResults) {
      parts = r.parts.map((p) => (p.functionResponse ? { text: `[Result of ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response ?? {})}]` } : p));
    } else {
      parts = r.parts;
    }
    if (!parts.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === r.role) last.parts = [...(last.parts ?? []), ...parts];
    else out.push({ role: r.role, parts });
  }
  return out;
}

export async function loadHistory(rfxId: string): Promise<StoredMessage[]> {
  const { data, error } = await db().from("copilot_messages").select("seq,turn,role,kind,parts,model,meta").eq("rfx_id", rfxId).order("seq");
  if (error) throw new Error(error.message);
  return (data ?? []) as StoredMessage[];
}

// Chat as shown in the UI: buyer text and the assistant's visible text + draft changes per turn.
export interface CopilotDisplayMessage { role: "user" | "assistant"; content: string; actions?: string[] }
export function toDisplay(rows: StoredMessage[]): CopilotDisplayMessage[] {
  const out: CopilotDisplayMessage[] = [];
  const turns = [...new Set(rows.map((r) => r.turn))];
  for (const t of turns) {
    const rs = rows.filter((r) => r.turn === t);
    for (const b of rs.filter((r) => r.kind === "buyer")) out.push({ role: "user", content: b.parts.map((p) => p.text ?? "").join("") });
    const text = rs.filter((r) => r.kind === "model").map((r) => r.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("")).join("\n\n").trim();
    const actions = rs.flatMap((r) => r.meta?.actions ?? []);
    if (text || actions.length) out.push({ role: "assistant", content: text || "Done.", actions });
  }
  return out;
}

export interface CopilotEvents {
  onStatus?: StatusFn;
  onDelta?: (text: string) => void; // streamed assistant text
  onReset?: () => void; // a failed attempt's partial text should be discarded
  onCommit?: () => void; // the streamed text so far is final
  models?: string[]; // override the chain (tests)
}

export async function copilotTurn(rfxId: string, message: string, ev: CopilotEvents = {}) {
  const [draft, catalog, rows] = await Promise.all([loadDraft(rfxId), catalogIndex(), loadHistory(rfxId)]);
  if (draft.rfx.status !== "draft") throw new Error("This RFx has been published and can no longer be edited.");
  let seq = rows.reduce((m, r) => Math.max(m, r.seq), 0);
  const turn = rows.reduce((m, r) => Math.max(m, r.turn), 0) + 1;
  const save = async (m: Omit<StoredMessage, "seq" | "turn">) => {
    const row = { ...m, seq: ++seq, turn };
    const { error } = await db().from("copilot_messages").insert({ rfx_id: rfxId, ...row });
    if (error) throw new Error(`Could not save the chat: ${error.message}`);
    rows.push(row);
  };
  await save({ role: "user", kind: "buyer", parts: [{ text: message }], model: null, meta: {} });

  const route = MODELS.copilot;
  const actions: string[] = [];
  let model: string | null = null;
  let reply = "";
  let system = systemFor(draft, catalog);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await geminiStreamChain("copilot", (modelId) => geminiStream(modelId, {
      system, contents: toRequestContents(rows), tools: [UPDATE_DRAFT], thinkingLevel: route.lowestThinking ? (lowestThinkingLevel(modelId) as ThinkingLevel) : undefined, temperature: 0.2, maxOutputTokens: 8000,
    }, route.timeoutMs, ev.onDelta), { models: ev.models, onStatus: ev.onStatus, onRetry: ev.onReset });
    model = r.model;
    ev.onCommit?.();
    await save({ role: "model", kind: "model", parts: r.parts, model: r.model, meta: {} });
    if (r.text.trim()) reply = reply ? `${reply}\n\n${r.text.trim()}` : r.text.trim();
    const calls = r.parts.filter((p) => p.functionCall);
    if (!calls.length) break;

    const responses: Part[] = [];
    const done: string[] = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      let result: unknown;
      if (fc.name === "update_draft") {
        ev.onStatus?.("Updating draft…");
        const changes = await updateDraft(rfxId, (fc.args ?? {}) as DraftChanges, catalog);
        done.push(...changes);
        result = { applied: changes };
      } else {
        result = { error: `Unknown tool ${fc.name}` };
      }
      responses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: result as Record<string, unknown> } });
    }
    actions.push(...done);
    await save({ role: "user", kind: "tool_result", parts: responses, model: null, meta: { actions: done } });
    ev.onStatus?.("Draft updated");
    system = systemFor(await loadDraft(rfxId), catalog);
  }
  return { reply: reply || (actions.length ? "Done." : "Sorry, I couldn't process that — please rephrase."), actions, model: model ? displayModel(model) : null };
}
