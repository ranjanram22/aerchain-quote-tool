import "server-only";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { chat } from "./llm";
import { loadDraft, setHeader, setTerms, addLines, updateLine, removeLine, setQuestionnaire, searchCatalog, type Draft } from "./draft";

const SYSTEM = `You are an RFx co-pilot for an industrial buyer. You help draft a request for quotation (RFx) by conversation and you record everything in the draft using tools. The draft is shown live next to the chat.

How to work:
- Gather: title, delivery location, scope summary, line items (each with full specification, unit of measure and annual quantity), a questionnaire (suggest 10–15 standard supplier questions for the category and mark the truly mandatory ones), and terms (response deadline, offer validity, payment terms, delivery terms/Incoterm, freight expectation, GST treatment, currency).
- Record facts as soon as the buyer gives them; do not wait for everything. After tool calls, reply briefly: what you recorded and the one or two most important things still missing.
- When the buyer names items, call search_catalog first and reuse catalog products (pass product_id and copy their spec) when they match; otherwise create new lines with a spec object (e.g. type, ply, flute, paper_gsm, bf, dimensions_mm, print, notes).
- When the buyer pastes a list (rows from a spreadsheet or an email), parse every row into add_line_items in one call. Keep the buyer's quantities and units exactly; if a row has no quantity or unit, leave it empty and say so.
- Units: use "piece", "set", "kg", "box", "m", "sqm", "litre" etc.
- Never record a quantity, price, date or commercial term the buyer did not state. You may SUGGEST standard terms in your reply (clearly labelled as suggestions) and record them only after the buyer agrees. The questionnaire is the exception: you may draft it directly, since the buyer reviews it in the draft.
- Use update_line_item / remove_line_item for corrections (line numbers are shown in the draft).
- Keep replies short and plain.`;

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({ type: "function" as const, function: { name, description, parameters: { type: "object", properties, required } } });
const lineProps = {
  description: { type: "string" }, category: { type: "string" }, unit: { type: "string" }, annual_qty: { type: "number" },
  product_id: { type: "string", description: "Catalog product id from search_catalog, if reused" }, spec: { type: "object", description: "Specification key/values" },
};
const TOOLS = [
  fn("set_header", "Set RFx title, category, delivery location and/or scope summary.", { title: { type: "string" }, category: { type: "string" }, location: { type: "string" }, scope: { type: "string" } }),
  fn("search_catalog", "Search the product catalog for matching items.", { query: { type: "string" } }, ["query"]),
  fn("add_line_items", "Append line items to the draft.", { items: { type: "array", items: { type: "object", properties: lineProps, required: ["description"] } } }, ["items"]),
  fn("update_line_item", "Change fields of one line.", { line_no: { type: "integer" }, ...lineProps }, ["line_no"]),
  fn("remove_line_item", "Remove one line (later lines are renumbered).", { line_no: { type: "integer" } }, ["line_no"]),
  fn("set_questionnaire", "Replace the whole questionnaire.", {
    questions: { type: "array", items: { type: "object", properties: {
      text: { type: "string" }, code: { type: "string", description: "short snake_case key, e.g. iso9001" }, mandatory: { type: "boolean" },
      type: { type: "string", enum: ["boolean", "min", "max", "text"] }, value: { type: "number", description: "threshold for min/max" }, unit: { type: "string" },
      evidence: { type: "string", enum: ["certificate", "gstin"], description: "document that proves the answer, if any" },
    }, required: ["text"] } },
  }, ["questions"]),
  fn("set_terms", "Set commercial terms (merge).", {
    response_deadline: { type: "string", description: "YYYY-MM-DD" }, validity_required_days: { type: "integer" }, payment_terms: { type: "string" }, delivery_terms: { type: "string" },
    incoterm: { type: "string" }, freight_expectation: { type: "string" }, gst_treatment: { type: "string" }, currency: { type: "string" }, contract_period: { type: "string" },
  }),
];

function snapshot(d: Draft) {
  return JSON.stringify({
    title: d.rfx.title, category: d.rfx.category, location: d.rfx.location, scope: d.rfx.scope, terms: d.rfx.terms,
    lines: d.lines.map((l) => ({ line_no: l.line_no, description: l.description, unit: l.unit, annual_qty: l.annual_qty, spec: l.spec })),
    questionnaire: d.questions.map((q) => ({ q_no: q.q_no, text: q.text, mandatory: (q.requirement as { mandatory?: boolean })?.mandatory })),
  });
}

async function apply(rfxId: string, name: string, a: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "set_header": return setHeader(rfxId, a as Parameters<typeof setHeader>[1]);
    case "search_catalog": return searchCatalog(String(a.query ?? ""));
    case "add_line_items": return addLines(rfxId, (a.items as Parameters<typeof addLines>[1]) ?? []);
    case "update_line_item": { const { line_no, ...rest } = a; return updateLine(rfxId, Number(line_no), rest as Parameters<typeof updateLine>[2]); }
    case "remove_line_item": return removeLine(rfxId, Number(a.line_no));
    case "set_questionnaire": return setQuestionnaire(rfxId, (a.questions as Parameters<typeof setQuestionnaire>[1]) ?? []);
    case "set_terms": return setTerms(rfxId, a);
    default: return `Unknown tool ${name}`;
  }
}

export interface CopilotTurn { role: "user" | "assistant"; content: string }

export async function copilotTurn(rfxId: string, message: string, history: CopilotTurn[]) {
  const draft = await loadDraft(rfxId);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: `${SYSTEM}\n\nToday is ${new Date().toISOString().slice(0, 10)}.` },
    ...history.slice(-12).map((h) => ({ role: h.role, content: h.content.slice(0, 6000) }) as ChatCompletionMessageParam),
    { role: "user", content: `Current draft (JSON): ${snapshot(draft)}\n\nBuyer: ${message}` },
  ];
  const actions: string[] = [];
  let model: string | null = null;
  let reply = "";
  for (let round = 0; round < 6; round++) {
    const r = await chat("copilot", { messages, tools: TOOLS, tool_choice: "auto", max_tokens: 6000, temperature: 0.2 });
    model = r.model;
    const msg = r.completion.choices[0]?.message;
    const calls = (msg?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
    if (!calls.length) { reply = msg?.content ?? ""; break; }
    messages.push({ role: "assistant", content: msg?.content ?? "", tool_calls: calls });
    for (const c of calls) {
      if (c.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* empty */ }
      let out: unknown;
      try { out = await apply(rfxId, c.function.name, args); } catch (e) { out = `Error: ${e instanceof Error ? e.message : e}`; }
      if (c.function.name !== "search_catalog") actions.push(typeof out === "string" ? out : c.function.name);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 12000) });
    }
  }
  return { reply: reply || (actions.length ? "Done." : "Sorry, I couldn't process that — please rephrase."), actions, model };
}
