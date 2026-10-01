"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { WorkspaceData } from "@/lib/workspace-data";
import type { Cell } from "@/lib/normalize";
import Summary from "./Summary";
import ComparisonGrid from "./ComparisonGrid";
import Questionnaire from "./Questionnaire";
import Responses from "./Responses";
import SourceDrawer from "./SourceDrawer";
import Chat from "./Chat";
import { dt, d8 } from "./format";
import { closeRfx, reopenRfx } from "@/app/actions/rfx";

// Close the RFx once a decision is taken: optional outcome + note.
function CloseDialog({ data, onClose }: { data: WorkspaceData; onClose: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const text = [outcome, note.trim()].filter(Boolean).join(". ");
    const r = await closeRfx(data.bundle.rfx.id, text || null);
    if (!r.ok) setErr(r.error); else onClose();
  });
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-semibold">Close this RFx</h3>
        <p className="mb-3 text-xs text-slate-500">Use this once a decision is taken. The RFx moves to “Closed” on Home, stops accepting replies, and keeps all its data. You can reopen it later.</p>
        <label className="mb-2 block text-xs text-slate-600">Outcome (optional)
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">—</option>
            {data.bundle.vendors.map((v) => <option key={v.id} value={`Awarded to ${v.name}`}>Awarded to {v.name}</option>)}
            <option value="Split award">Split award</option>
            <option value="Not awarded / cancelled">Not awarded / cancelled</option>
          </select>
        </label>
        <label className="mb-3 block text-xs text-slate-600">Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Approved by plant head on 5 Oct" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        {err && <p className="mb-2 text-xs text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-slate-500">Cancel</button>
          <button disabled={pending} onClick={submit} className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "Closing…" : "Close RFx"}</button>
        </div>
      </div>
    </div>
  );
}

const TABS = ["Summary", "Comparison", "Questionnaire & attachments", "Responses", "Outbox", "Activity"] as const;

function Outbox({ data }: { data: WorkspaceData }) {
  const vName = (id: string | null) => data.bundle.vendors.find((v) => v.id === id)?.name ?? "—";
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Simulated send: nothing leaves this app. Every invitation and follow-up is recorded here.</p>
      {data.outbox.map((m) => (
        <details key={m.id} className="rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${m.kind === "invite" ? "bg-sky-100 text-sky-900" : "bg-violet-100 text-violet-900"}`}>{m.kind === "invite" ? "Invitation" : "Follow-up"}</span>
            <span className="font-medium">{vName(m.vendor_id)}</span>
            <span className="text-slate-600">{m.subject}</span>
            <span className="ml-auto text-xs text-slate-500">{dt(m.sent_at)} · Simulated send</span>
          </summary>
          <pre className="whitespace-pre-wrap border-t border-slate-100 px-4 py-3 font-sans text-xs">To: {m.to_email}{"\n\n"}{m.body}</pre>
        </details>
      ))}
    </div>
  );
}

function Activity({ data }: { data: WorkspaceData }) {
  const show = (v: unknown) => (v == null ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Who</th><th className="px-3 py-2 font-medium">Action</th><th className="px-3 py-2 font-medium">Target</th><th className="px-3 py-2 font-medium">Old → New</th><th className="px-3 py-2 font-medium">Note</th></tr>
        </thead>
        <tbody>
          {data.audit.map((a) => (
            <tr key={a.id} className="border-t border-slate-100 align-top">
              <td className="whitespace-nowrap px-3 py-2">{dt(a.at)}</td>
              <td className="px-3 py-2">{a.actor}</td>
              <td className="px-3 py-2 font-medium">{a.action.replace(/_/g, " ")}</td>
              <td className="px-3 py-2 font-mono text-[10px]">{a.target}</td>
              <td className="max-w-[420px] px-3 py-2 font-mono text-[10px] text-slate-600"><span className="line-clamp-3">{show(a.old_value)} → {show(a.new_value)}</span></td>
              <td className="px-3 py-2">{a.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Workspace({ data }: { data: WorkspaceData }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Summary");
  const [cellKey, setCellKey] = useState<{ line: string; vendor: string } | null>(null);
  const cell: Cell | undefined = cellKey ? data.cmp.cells.find((c) => c.line_id === cellKey.line && c.vendor_id === cellKey.vendor) : undefined;
  const open = data.bundle.openItems.filter((i) => i.status === "open").length;
  const replied = data.bundle.responses.length;
  const closed = data.bundle.rfx.status === "closed";
  const [closing, setClosing] = useState(false);
  const [reopening, startReopen] = useTransition();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <Link href="/" className="text-xs text-indigo-700 hover:underline">← Home</Link>
          <h1 className="truncate text-lg font-semibold">{data.bundle.rfx.title}</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span>{replied}/{data.bundle.vendors.length} replied</span>
          <button onClick={() => setTab("Summary")} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">⚠ {open} open</button>
          {closed
            ? <button disabled={reopening} onClick={() => startReopen(async () => { await reopenRfx(data.bundle.rfx.id); })} className="rounded border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50">{reopening ? "Reopening…" : "Reopen RFx"}</button>
            : <button onClick={() => setClosing(true)} className="rounded border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-50">Close RFx…</button>}
          <span>Ranjan (Buyer)</span>
        </div>
      </header>
      {closed && (
        <div className="border-b border-slate-300 bg-slate-100 px-5 py-2 text-sm text-slate-700">
          <b>Closed</b> on {d8(data.bundle.rfx.closed_at)}{data.bundle.rfx.closed_note ? ` — ${data.bundle.rfx.closed_note}` : ""}. Read-only for new replies; everything stays viewable.
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-[65] flex-col">
          <section className="border-b border-indigo-100 bg-indigo-50/60 px-5 py-2.5 text-[13px] leading-snug text-slate-800">
            <div className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
              Recommendation
              <span className="font-normal normal-case tracking-normal text-slate-500">{data.insight.note ? `${data.insight.note} · ` : ""}computed, not AI-written</span>
            </div>
            {data.insight.lines.map((l, i) => {
              const at = data.insight.top && i === 0 ? l.indexOf(data.insight.top) : -1;
              return <p key={i} className={l.startsWith("Before awarding") ? "text-amber-900" : undefined}>{at >= 0 ? <>{l.slice(0, at)}<b>{data.insight.top}</b>{l.slice(at + data.insight.top!.length)}</> : l}</p>;
            })}
          </section>
          <nav className="flex gap-1 border-b border-slate-200 bg-white px-4">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2.5 text-sm ${tab === t ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t}</button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "Summary" && <Summary data={data} goTo={(t) => setTab(t as (typeof TABS)[number])} />}
            {tab === "Comparison" && <ComparisonGrid data={data} onOpenCell={(c) => setCellKey({ line: c.line_id, vendor: c.vendor_id })} />}
            {tab === "Questionnaire & attachments" && <Questionnaire data={data} />}
            {tab === "Responses" && <Responses data={data} />}
            {tab === "Outbox" && <Outbox data={data} />}
            {tab === "Activity" && <Activity data={data} />}
          </div>
        </main>
        <aside className="hidden min-w-[340px] flex-[35] flex-col border-l border-slate-200 bg-slate-50/50 lg:flex">
          <Chat data={data} />
        </aside>
      </div>
      {closing && <CloseDialog data={data} onClose={() => setClosing(false)} />}
      {cell && <SourceDrawer data={data} cell={cell} onClose={() => setCellKey(null)} />}
    </div>
  );
}
