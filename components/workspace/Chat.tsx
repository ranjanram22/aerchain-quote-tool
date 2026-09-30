"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WorkspaceData } from "@/lib/workspace-data";
import type { Answer, AnswerTable, AnswerChart, ChatTurn } from "@/lib/agent/types";
import OpenItemForm from "./OpenItemForm";
import { readNdjson } from "@/lib/stream";
import { inr, inrShort } from "./format";

const CHIPS = [
  "Summarize this RFx",
  "Who hasn't replied?",
  "What's missing?",
  "Cheapest per line",
  "Cheapest among quality-compliant vendors",
  "Split award scenarios",
  "Compare to last year",
];

type Msg = { role: "user"; text: string } | { role: "assistant"; answer: Answer; question: string } | { role: "error"; text: string };

function fmtCell(v: string | number | null | undefined, f?: string) {
  if (v == null || v === "") return "—";
  if (typeof v !== "number") return v;
  if (f === "inr") return inr(v);
  if (f === "inr_short") return inrShort(v);
  if (f === "pct") return `${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
  if (f === "int") return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function RichText({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-[13px] leading-relaxed">
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t) return null;
        if (/^[-•*]\s/.test(t)) return <div key={i} className="flex gap-1.5 pl-1"><span className="text-slate-400">•</span><span>{bold(t.replace(/^[-•*]\s/, ""))}</span></div>;
        return <p key={i}>{bold(t)}</p>;
      })}
    </div>
  );
}

async function downloadXlsx(table: AnswerTable, question: string) {
  const r = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ table, question }) });
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${table.title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function TableView({ t, question }: { t: AnswerTable; question: string }) {
  const [all, setAll] = useState(false);
  const rows = all ? t.rows : t.rows.slice(0, 12);
  return (
    <div className="rounded-md border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-2 py-1">
        <span className="truncate text-[11px] font-medium">{t.title}</span>
        <button onClick={() => downloadXlsx(t, question)} className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] hover:bg-slate-50">⬇ Download Excel</button>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-white text-left text-slate-500"><tr>{t.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-2 py-1 font-medium">{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {t.columns.map((c) => <td key={c.key} className={`whitespace-nowrap px-2 py-1 ${typeof r[c.key] === "number" ? "text-right tabular-nums" : ""}`}>{fmtCell(r[c.key], c.format)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(t.rows.length > 12 || t.note) && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-1 text-[10px] text-slate-500">
          <span>{t.note}</span>
          {t.rows.length > 12 && <button onClick={() => setAll(!all)} className="shrink-0 text-indigo-600">{all ? "Show less" : `Show all ${t.rows.length} rows`}</button>}
        </div>
      )}
    </div>
  );
}

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
function ChartView({ c }: { c: AnswerChart }) {
  const data = c.data.map((d) => ({ ...d, [c.x]: String(d[c.x] ?? "") }));
  const tick = (v: number) => (Math.abs(v) >= 1e5 ? inrShort(v) : v.toLocaleString("en-IN"));
  return (
    <div className="rounded-md border border-slate-200 p-2">
      <div className="mb-1 text-[11px] font-medium">{c.title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {c.type === "line" ? (
            <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={c.x} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={tick} /><Tooltip formatter={(v) => (typeof v === "number" ? tick(v) : String(v))} /><Legend wrapperStyle={{ fontSize: 10 }} />
              {c.series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} />)}</LineChart>
          ) : (
            <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={c.x} tick={{ fontSize: 10 }} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 60 : 30} /><YAxis tick={{ fontSize: 10 }} tickFormatter={tick} /><Tooltip formatter={(v) => (typeof v === "number" ? tick(v) : String(v))} /><Legend wrapperStyle={{ fontSize: 10 }} />
              {c.series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} stackId={c.type === "stacked_bar" ? "a" : undefined} />)}</BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnswerView({ a, question, data }: { a: Answer; question: string; data: WorkspaceData }) {
  const [chip, setChip] = useState<string | null>(null);
  const item = chip ? data.bundle.openItems.find((i) => i.id === chip) : undefined;
  return (
    <div className="space-y-2">
      {!a.numbers_check.ok && (
        <div className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-900">
          ⚠ Some numbers in this text could not be traced to a computation ({a.numbers_check.unverified.join(", ")}). Trust the tables, not those figures.
        </div>
      )}
      <RichText text={a.text} />
      {a.open_item_refs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.open_item_refs.slice(0, 12).map((r) => (
            <button key={r.id} onClick={() => setChip(chip === r.id ? null : r.id)} title={r.message}
              className={`rounded-full px-2 py-0.5 text-[10px] ${chip === r.id ? "bg-amber-300 text-amber-950" : "bg-amber-100 text-amber-900 hover:bg-amber-200"}`}>
              ⚠ {r.vendor ? `${r.vendor.split(" ")[0]} · ` : ""}{r.kind.replace(/_/g, " ")}
            </button>
          ))}
          {a.open_item_refs.length > 12 && <span className="text-[10px] text-slate-500">+{a.open_item_refs.length - 12} more in Summary</span>}
        </div>
      )}
      {item && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2">
          <p className="mb-1.5 text-xs">{item.message}</p>
          <OpenItemForm rfxId={data.bundle.rfx.id} item={item} onDone={() => setChip(null)} />
          <p className="mt-1 text-[10px] text-slate-500">After saving, ask again to get updated numbers.</p>
        </div>
      )}
      {a.tables.map((t) => <TableView key={t.id} t={t} question={question} />)}
      {a.charts.map((c) => <ChartView key={c.id} c={c} />)}
      <details className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
        <summary className="cursor-pointer font-medium">How this was computed</summary>
        <div className="mt-1 space-y-1.5">
          <div><b>Tools called</b>{a.method.length === 0 ? ": none" : ""}
            <ol className="list-decimal pl-4">{a.method.map((m, i) => <li key={i}><span className="font-mono">{m.tool}</span>({Object.keys(m.params).length ? <span className="font-mono text-[10px]">{JSON.stringify(m.params)}</span> : ""}) — {m.summary}</li>)}</ol>
          </div>
          {a.included.length > 0 && <div><b>Data included:</b> {a.included.join(", ")}</div>}
          {a.excluded.length > 0 && <div><b>Excluded:</b><ul className="list-disc pl-4">{a.excluded.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {a.caveats.length > 0 && <div><b>Caveats:</b><ul className="list-disc pl-4">{a.caveats.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          <div className="text-slate-500">All figures come from deterministic calculations on the extracted quotes; the model ({a.model}) only chose the tools and wrote the text. Number check: {a.numbers_check.ok ? "every number traced ✓" : "failed"}{a.numbers_check.regenerated ? " (answer regenerated once)" : ""}.</div>
        </div>
      </details>
    </div>
  );
}

export default function Chat({ data }: { data: WorkspaceData }) {
  const storeKey = `chat:${data.bundle.rfx.id}`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restore this viewer's chat after hydration (localStorage is browser-only).
    try {
      const s = localStorage.getItem(storeKey);
       
      if (s) setMsgs(JSON.parse(s));
    } catch { /* ignore */ }
  }, [storeKey]);
  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, storeKey]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    const history: ChatTurn[] = msgs.flatMap((m): ChatTurn[] => (m.role === "user" ? [{ role: "user", content: m.text }] : m.role === "assistant" ? [{ role: "assistant", content: m.answer.text }] : []));
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    setStatus(null);
    try {
      const r = await fetch(`/api/rfx/${data.bundle.rfx.id}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "Something went wrong."); }
      const answer = await readNdjson<Answer>(r, setStatus);
      setMsgs((m) => [...m, { role: "assistant", answer, question: q }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "error", text: e instanceof Error ? e.message : "Network error — please try again." }]);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-medium">Ask about this RFx</span>
        {msgs.length > 0 && <button onClick={() => setMsgs([])} className="text-[11px] text-slate-500 hover:text-slate-800">Clear</button>}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {msgs.length === 0 && (
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            Ask anything about the quotes: prices, coverage, compliance, split awards, last year, what-ifs. Every number is computed from the extracted data, and each answer shows how.
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-lg bg-indigo-600 px-3 py-2 text-[13px] text-white">{m.text}</div>
          ) : m.role === "error" ? (
            <div key={i} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{m.text}</div>
          ) : (
            <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2"><AnswerView a={m.answer} question={m.question} data={data} /></div>
          ),
        )}
        {busy && (
          <div className={`flex items-center gap-2 text-xs ${status && /busy|retrying|backup|not responding/i.test(status) ? "text-amber-700" : "text-slate-500"}`}>
            <span className={`h-2 w-2 animate-pulse rounded-full ${status && /busy|retrying|backup/i.test(status) ? "bg-amber-500" : "bg-indigo-500"}`} />
            {status ?? "Analysing — calling tools and checking numbers…"}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {CHIPS.map((c) => <button key={c} disabled={busy} onClick={() => ask(c)} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50">{c}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Best split with at most 2 vendors, landed cost" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
          <button disabled={busy || !input.trim()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Ask</button>
        </form>
      </div>
    </div>
  );
}
