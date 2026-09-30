"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkspaceData } from "@/lib/workspace-data";
import type { Cell } from "@/lib/normalize";
import Summary from "./Summary";
import ComparisonGrid from "./ComparisonGrid";
import Questionnaire from "./Questionnaire";
import Responses from "./Responses";
import SourceDrawer from "./SourceDrawer";
import { dt } from "./format";

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
          <span>Ranjan (Buyer)</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-[65] flex-col">
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
        <aside className="hidden min-w-[320px] flex-[35] flex-col border-l border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-medium">Ask about this RFx</div>
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">The analysis chat arrives in Phase 4.</div>
        </aside>
      </div>
      {cell && <SourceDrawer data={data} cell={cell} onClose={() => setCellKey(null)} />}
    </div>
  );
}
