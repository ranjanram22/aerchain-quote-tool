"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveHeader, saveTerms, addLine, saveLine, deleteLine, saveQuestions, deleteDraft, publishDraft } from "@/app/actions/draft";

type Row = Record<string, unknown>;
export interface DraftProps {
  rfx: Row & { id: string; title: string; terms: Record<string, unknown> };
  lines: Row[];
  questions: Row[];
  vendors: { id: string; name: string; email: string | null; categories: string[] }[];
}
type Msg = { role: "user" | "assistant"; content: string; actions?: string[] };

const STARTERS = [
  "New RFx for corrugated boxes for our Chakan plant, annual contract",
  "Add 3-ply RSC boxes 250x200x150, 50,000 per year",
  "Suggest a standard supplier questionnaire",
  "Payment 60 days, DAP Chakan, quotes due in 2 weeks",
];

const inp = "w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none";

function Field({ label, value, onSave, multiline }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]); // eslint-disable-line react-hooks/set-state-in-effect
  const commit = () => { if (v !== value) onSave(v); };
  return (
    <label className="block text-[11px] text-slate-500">
      {label}
      {multiline ? <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} rows={2} className={inp} /> : <input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} className={inp} />}
    </label>
  );
}

const TERM_FIELDS: [string, string][] = [
  ["response_deadline", "Response deadline"], ["validity_required_days", "Offer validity (days)"], ["payment_terms", "Payment terms"],
  ["delivery_terms", "Delivery terms"], ["incoterm", "Incoterm"], ["freight_expectation", "Freight"], ["gst_treatment", "GST"], ["currency", "Currency"],
];

export default function CoPilot({ rfx, lines, questions, vendors }: DraftProps) {
  const router = useRouter();
  const storeKey = `copilot:${rfx.id}`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [publishing, setPublishing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const terms = (rfx.terms ?? {}) as Record<string, unknown>;

  useEffect(() => {
    try { const s = localStorage.getItem(storeKey); if (s) setMsgs(JSON.parse(s)); } catch { /* ignore */ }  
  }, [storeKey]);
  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(msgs.slice(-40))); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, storeKey]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setInput(""); setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/rfx/${rfx.id}/copilot`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, history }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsgs((m) => [...m, { role: "assistant", content: j.reply, actions: j.actions }]);
      router.refresh();
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠ ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy(false);
    }
  };
  const act = (f: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await f(); if (!r.ok) setErr(r.error ?? "Failed"); else setErr(null); });

  const qList = questions.map((q) => ({ text: String(q.text), code: String(q.code ?? ""), ...(q.requirement as Record<string, unknown>) })) as { text: string; code: string; mandatory?: boolean; type?: string; value?: number; unit?: string; evidence?: string }[];
  const setQs = (next: typeof qList) => act(() => saveQuestions(rfx.id, next.map((q) => ({ text: q.text, code: q.code, mandatory: !!q.mandatory, type: (q.type as "boolean") ?? "text", value: q.value ?? null, unit: q.unit ?? null, evidence: q.evidence ?? null }))));
  const missing = [
    rfx.title === "Untitled RFx" && "title", !rfx.location && "delivery location", !lines.length && "line items",
    lines.some((l) => l.annual_qty == null) && "quantities on some lines", !questions.length && "questionnaire", !terms.response_deadline && "response deadline",
  ].filter(Boolean) as string[];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <Link href="/" className="text-xs text-indigo-700 hover:underline">← Home</Link>
          <h1 className="text-lg font-semibold">New RFx <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">Draft</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { if (confirm("Delete this draft?")) start(async () => { await deleteDraft(rfx.id); }); }} className="text-xs text-rose-600 hover:underline">Delete draft</button>
          <button onClick={() => setPublishing(true)} disabled={!lines.length} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Publish to vendors…</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Chat */}
        <section className="flex w-[40%] min-w-[340px] flex-col border-r border-slate-200 bg-slate-50/60">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                Tell me what you need to buy. I&apos;ll build the RFx on the right as we talk: header, line items (from the catalog where possible), questionnaire and terms. You can also paste a list of items straight from Excel.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-10 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white" : "mr-6 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200"}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.actions && m.actions.length > 0 && <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 text-[11px] text-emerald-700">{m.actions.map((a, j) => <div key={j}>✓ {a}</div>)}</div>}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" /> Updating the draft…</div>}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-200 bg-white p-3">
            {msgs.length === 0 && <div className="mb-2 flex flex-wrap gap-1">{STARTERS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50">{s}</button>)}</div>}
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={3} placeholder="Describe what you need, or paste a list of items (Shift+Enter for a new line)" className="min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
              <button disabled={busy || !input.trim()} className="self-end rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Send</button>
            </form>
          </div>
        </section>

        {/* Live draft */}
        <section className="min-w-0 flex-1 overflow-y-auto p-5">
          {err && <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{err}</div>}
          {missing.length > 0 && <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Still missing: {missing.join(", ")}</div>}
          <div className={`space-y-5 ${pending ? "opacity-70" : ""}`}>
            <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2">
              <Field label="Title" value={rfx.title} onSave={(v) => act(() => saveHeader(rfx.id, { title: v }))} />
              <Field label="Category" value={String(rfx.category ?? "")} onSave={(v) => act(() => saveHeader(rfx.id, { category: v }))} />
              <Field label="Delivery location / plant" value={String(rfx.location ?? "")} onSave={(v) => act(() => saveHeader(rfx.id, { location: v }))} />
              <div className="md:col-span-2"><Field label="Scope" multiline value={String(rfx.scope ?? "")} onSave={(v) => act(() => saveHeader(rfx.id, { scope: v }))} /></div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <h3 className="text-sm font-medium">Line items <span className="text-xs text-slate-500">({lines.length})</span></h3>
                <button onClick={() => act(() => addLine(rfx.id, { description: "New item", unit: "piece" }))} className="text-xs text-indigo-700 hover:underline">+ Add line</button>
              </div>
              {lines.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">No lines yet. Describe items in the chat or paste a list.</p> : (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500"><tr><th className="px-2 py-1 font-medium">#</th><th className="px-2 py-1 font-medium">Description</th><th className="px-2 py-1 font-medium">Spec</th><th className="w-20 px-2 py-1 font-medium">Unit</th><th className="w-28 px-2 py-1 font-medium">Annual qty</th><th /></tr></thead>
                  <tbody>
                    {lines.map((l) => {
                      const n = l.line_no as number;
                      return (
                        <tr key={String(l.id)} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1.5 text-slate-400">{n}</td>
                          <td className="px-2 py-1"><Field label="" value={String(l.description)} onSave={(v) => act(() => saveLine(rfx.id, n, { description: v }))} />{l.product_id ? <span className="text-[10px] text-emerald-700">✓ from catalog</span> : null}</td>
                          <td className="max-w-[240px] px-2 py-1.5 text-[10px] text-slate-500">{Object.entries((l.spec as Record<string, unknown>) ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</td>
                          <td className="px-2 py-1"><Field label="" value={String(l.unit ?? "")} onSave={(v) => act(() => saveLine(rfx.id, n, { unit: v }))} /></td>
                          <td className="px-2 py-1"><Field label="" value={l.annual_qty == null ? "" : String(l.annual_qty)} onSave={(v) => act(() => saveLine(rfx.id, n, { annual_qty: v.trim() ? Number(v.replace(/,/g, "")) : null }))} /></td>
                          <td className="px-2 py-1.5"><button onClick={() => act(() => deleteLine(rfx.id, n))} className="text-slate-400 hover:text-rose-600">×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <h3 className="text-sm font-medium">Questionnaire <span className="text-xs text-slate-500">({questions.length})</span></h3>
                <button onClick={() => setQs([...qList, { text: "New question", code: "", type: "text" }])} className="text-xs text-indigo-700 hover:underline">+ Add question</button>
              </div>
              {qList.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">Ask the co-pilot to suggest a standard questionnaire.</p> : (
                <ul className="divide-y divide-slate-100">
                  {qList.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 px-4 py-1.5 text-xs">
                      <span className="mt-1.5 text-slate-400">Q{i + 1}</span>
                      <div className="flex-1"><Field label="" value={q.text} onSave={(v) => setQs(qList.map((x, j) => (j === i ? { ...x, text: v } : x)))} /></div>
                      <label className="mt-1.5 flex items-center gap-1 whitespace-nowrap text-[11px]"><input type="checkbox" checked={!!q.mandatory} onChange={(e) => setQs(qList.map((x, j) => (j === i ? { ...x, mandatory: e.target.checked } : x)))} /> Mandatory</label>
                      <span className="mt-1.5 text-[10px] text-slate-400">{q.type}{q.value != null ? ` ${q.value}${q.unit ? " " + q.unit : ""}` : ""}</span>
                      <button onClick={() => setQs(qList.filter((_, j) => j !== i))} className="mt-1 text-slate-400 hover:text-rose-600">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2">
              <h3 className="text-sm font-medium md:col-span-2">Terms</h3>
              {TERM_FIELDS.map(([k, label]) => (
                <Field key={k} label={label} value={terms[k] == null ? "" : String(terms[k])} onSave={(v) => act(() => saveTerms(rfx.id, { [k]: k === "validity_required_days" ? Number(v) || v : v }))} />
              ))}
            </section>
          </div>
        </section>
      </div>

      {publishing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30" onClick={() => setPublishing(false)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-semibold">Publish to vendors</h3>
            <p className="mb-3 text-xs text-slate-500">Each selected vendor gets an invitation email in the Outbox (subject, RFx summary, line items, questionnaire, and “reply in any format”). <b>Simulated send</b> — nothing leaves this app.</p>
            <div className="mb-3 max-h-64 space-y-1 overflow-y-auto">
              {vendors.map((v) => (
                <label key={v.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={picked.includes(v.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, v.id] : picked.filter((x) => x !== v.id))} />
                  <span className="flex-1">{v.name}</span><span className="text-[11px] text-slate-400">{v.email}</span>
                </label>
              ))}
            </div>
            {missing.length > 0 && <p className="mb-2 text-xs text-amber-700">Heads-up — still missing: {missing.join(", ")}.</p>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setPublishing(false)} className="text-sm text-slate-500">Cancel</button>
              <button disabled={!picked.length || pending} onClick={() => act(async () => { const r = await publishDraft(rfx.id, picked); if (r.ok) setPublishing(false); return r; })}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40">{pending ? "Publishing…" : `Publish to ${picked.length} vendor(s)`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
