// Co-pilot conversation test (DECISIONS T9/T10).
//   npx tsx --conditions=react-server --env-file=.env.local seed/eval/copilot-conversation.ts [--keep]
// 1. Offline checks of history replay (thought signatures, foreign/unanswered tool calls).
// 2. A live 10-turn conversation on a fresh draft with several update_draft calls.
//    After turn 5 the history is reloaded from the database and checked; turn 6
//    is forced onto the fallback model (Gemini Flash) to exercise a mid-conversation
//    model switch; turns 7-10 run on the normal chain. Prints seconds per turn.
import assert from "node:assert/strict";
import { db } from "../../lib/supabase";
import { copilotTurn, loadHistory, toDisplay, toRequestContents, type StoredMessage } from "../../lib/copilot";
import { loadDraft } from "../../lib/draft";
import { MODELS } from "../../lib/models";
import { SCRIPT } from "./copilot-script";

const keep = process.argv.includes("--keep");

function offlineChecks() {
  const m = (p: Partial<StoredMessage>): StoredMessage => ({ seq: 0, turn: 1, role: "user", kind: "buyer", parts: [], model: null, meta: {}, ...p });
  const signedCall = { functionCall: { name: "update_draft", args: { header: { title: "X" } } }, thoughtSignature: "sig-A" };
  const rows: StoredMessage[] = [
    m({ seq: 1, turn: 1, parts: [{ text: "hello" }] }),
    // Old history: a tool call made by a non-Gemini model (no signature).
    m({ seq: 2, turn: 1, role: "model", kind: "model", model: "openrouter:some/model:free", parts: [{ functionCall: { name: "update_draft", args: { header: { title: "Old" } } } }] }),
    m({ seq: 3, turn: 1, kind: "tool_result", parts: [{ functionResponse: { name: "update_draft", response: { applied: ["Header updated: title"] } } }] }),
    m({ seq: 4, turn: 1, role: "model", kind: "model", model: "openrouter:some/model:free", parts: [{ text: "Recorded." }] }),
    m({ seq: 5, turn: 2, parts: [{ text: "next" }] }),
    // Gemini call with signature, answered → replayed exactly.
    m({ seq: 6, turn: 2, role: "model", kind: "model", model: "gemini:gemini-3.5-flash-lite", parts: [{ text: "Sure.", thoughtSignature: "sig-T" }, signedCall] }),
    m({ seq: 7, turn: 2, kind: "tool_result", parts: [{ functionResponse: { name: "update_draft", response: { applied: ["ok"] } } }] }),
    m({ seq: 8, turn: 2, role: "model", kind: "model", model: "gemini:gemini-3.6-flash", parts: [{ text: "Done.", thoughtSignature: "sig-B" }] }),
    m({ seq: 9, turn: 3, parts: [{ text: "again" }] }),
    // Gemini call whose result was never saved (turn failed) → must not be sent as a functionCall.
    m({ seq: 10, turn: 3, role: "model", kind: "model", model: "gemini:gemini-3.5-flash-lite", parts: [signedCall] }),
    m({ seq: 11, turn: 4, parts: [{ text: "and again" }] }),
  ];
  const c = toRequestContents(rows);
  const all = c.flatMap((x) => x.parts ?? []);
  // Only the signed, answered Gemini call survives as a functionCall, unchanged.
  const fcs = all.filter((p) => p.functionCall);
  assert.equal(fcs.length, 1, "exactly one functionCall replayed");
  assert.deepEqual(fcs[0], signedCall, "signed call replayed byte-for-byte");
  assert.ok(all.some((p) => p.text === "Sure." && p.thoughtSignature === "sig-T"), "signature on text part kept");
  assert.ok(all.some((p) => p.text === "Done." && p.thoughtSignature === "sig-B"), "other Gemini model's signature kept");
  assert.ok(all.some((p) => p.text?.startsWith("[Earlier step: called update_draft")), "foreign call summarised as text");
  assert.ok(all.some((p) => p.text?.startsWith("[Result of update_draft")), "foreign result summarised as text");
  assert.equal(all.filter((p) => p.functionResponse).length, 1, "only the answered Gemini call keeps its functionResponse");
  for (let i = 1; i < c.length; i++) assert.notEqual(c[i].role, c[i - 1].role, "roles alternate");
  console.log("offline history checks: ok");
}

function checkStored(rows: StoredMessage[], label: string) {
  const calls = rows.filter((r) => r.kind === "model" && r.parts.some((p) => p.functionCall));
  for (const r of calls) assert.ok(r.parts.some((p) => p.functionCall && p.thoughtSignature), `${label}: tool call at seq ${r.seq} saved without its thought signature`);
  for (const r of calls) assert.equal(rows.find((x) => x.seq === r.seq + 1)?.kind, "tool_result", `${label}: tool call at seq ${r.seq} has no saved result`);
  return calls.length;
}

(async () => {
  offlineChecks();
  const { data } = await db().from("rfxs").insert({ title: "Untitled RFx", status: "draft", terms: {} }).select("id").single();
  const id = data!.id as string;
  const times: { turn: number; s: number; model: string | null }[] = [];
  try {
    for (let i = 0; i < SCRIPT.length; i++) {
      const turnNo = i + 1;
      if (turnNo === 6) {
        // Reload mid-way: fresh read from the database, as after a page reload or a new server instance.
        const rows = await loadHistory(id);
        const n = checkStored(rows, "after turn 5");
        const shown = toDisplay(rows);
        assert.equal(shown.filter((m) => m.role === "user").length, 5, "5 buyer messages reloaded");
        assert.equal(shown.filter((m) => m.role === "assistant").length, 5, "5 replies reloaded");
        console.log(`reloaded from DB after turn 5: ${rows.length} rows, ${n} tool calls, all with thought signatures`);
      }
      const models = turnNo === 6 ? MODELS.copilot.chain.slice(1) : undefined; // forced fallback (Flash) mid-conversation
      let streamed = 0;
      const t = Date.now();
      const r = await copilotTurn(id, SCRIPT[i], { models, onDelta: (d) => { streamed += d.length; }, onStatus: (s) => { if (/busy|retry|Switching/.test(s)) console.log(`   · ${s}`); } });
      const s = (Date.now() - t) / 1000;
      times.push({ turn: turnNo, s, model: r.model });
      assert.ok(streamed > 0, `turn ${turnNo}: no streamed text`);
      console.log(`turn ${turnNo} ${s.toFixed(1)}s [${r.model}] ${SCRIPT[i].slice(0, 45)} → ${r.actions.join("; ").slice(0, 140) || "(no changes)"}`);
    }
    const rows = await loadHistory(id);
    const n = checkStored(rows, "end");
    assert.ok(n >= 6, `expected several tool calls, got ${n}`);
    const d = await loadDraft(id);
    const lines = d.lines.map((l) => ({ no: l.line_no as number, desc: String(l.description), qty: l.annual_qty == null ? null : Number(l.annual_qty) }));
    console.log("final lines:", JSON.stringify(lines));
    assert.equal(lines.length, 3, "3 lines after removing partitions and adding edge protectors");
    assert.ok(lines.some((l) => l.qty === 45000), "3-ply quantity changed to 45,000");
    assert.ok(lines.some((l) => l.qty === 12000), "5-ply 12,000 kept");
    assert.ok(lines.some((l) => l.qty === 8000 && /edge/i.test(l.desc)), "edge protectors added");
    assert.ok(!lines.some((l) => /partition/i.test(l.desc)), "partitions removed");
    assert.ok(d.questions.length >= 8, "questionnaire drafted");
    assert.ok(d.questions.some((q) => /iso/i.test(String(q.text)) && (q.requirement as { mandatory?: boolean }).mandatory), "ISO 9001 mandatory");
    const terms = d.rfx.terms as Record<string, unknown>;
    assert.equal(terms.response_deadline, "2026-10-20", "deadline");
    assert.match(String(terms.payment_terms ?? ""), /60/, "payment terms");
    assert.match(String(d.rfx.scope ?? ""), /rate contract/i, "scope updated");
    const avg = times.reduce((a, b) => a + b.s, 0) / times.length;
    console.log(`PASS — ${times.length} turns, ${n} tool calls, average ${avg.toFixed(1)}s per turn (min ${Math.min(...times.map((t) => t.s)).toFixed(1)}s, max ${Math.max(...times.map((t) => t.s)).toFixed(1)}s)`);
  } finally {
    if (keep) console.log(`kept draft /rfx/${id}`);
    else await db().from("rfxs").delete().eq("id", id);
  }
})().catch((e) => { console.error("FAIL:", e instanceof Error ? e.message : e); process.exit(1); });
