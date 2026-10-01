"use client";

import { useState } from "react";
import type { WorkspaceData } from "@/lib/workspace-data";
import OpenItemForm, { kindLabel } from "./OpenItemForm";
import { d8, inrShort, dt } from "./format";

export default function Summary({ data, goTo }: { data: WorkspaceData; goTo: (tab: string) => void }) {
  const { bundle, cmp } = data;
  const t = bundle.rfx.terms as Record<string, string | number>;
  const open = bundle.openItems.filter((i) => i.status === "open");
  const [showResolved, setShowResolved] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const vName = (id: string | null) => bundle.vendors.find((v) => v.id === id)?.name ?? "—";
  const items = (showResolved ? bundle.openItems : open).filter((i) => vendorFilter === "all" || i.vendor_id === vendorFilter);
  const byVendor = [...cmp.vendors].sort((a, b) => a.total_unit_inr - b.total_unit_inr);

  const flags: { tone: string; text: string }[] = [];
  for (const v of cmp.vendors.filter((x) => x.replied)) {
    for (const f of v.mandatory_failures) flags.push({ tone: "rose", text: `${v.name}: fails mandatory ${f}` });
    for (const f of v.mandatory_unknown) flags.push({ tone: "amber", text: `${v.name}: mandatory unverified — ${f}` });
    if (v.replied && v.freight.status === "unknown") flags.push({ tone: "amber", text: `${v.name}: ${v.freight.text} — landed cost incomplete` });
    for (const d of v.discounts.filter((x) => x.status === "pending")) flags.push({ tone: "sky", text: `${v.name}: conditional discount not applied — ${d.text}` });
  }
  const devs = cmp.cells.filter((c) => c.state === "deviation");
  for (const c of devs) flags.push({ tone: "rose", text: `${vName(c.vendor_id)} line ${c.line_no}: spec deviation — ${(c.deviation ?? []).map((d) => `${d.field} ${d.offered} vs ${d.requested}`).join("; ")}` });

  return (
    <div className="space-y-6">
      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm md:grid-cols-4">
        <div><div className="text-xs text-slate-500">Location</div>{bundle.rfx.location}</div>
        <div><div className="text-xs text-slate-500">RFx date · deadline</div>{d8(bundle.rfx.rfx_date)} · {d8(String(t.response_deadline ?? ""))}</div>
        <div><div className="text-xs text-slate-500">Lines · questions</div>{bundle.lines.length} lines · {bundle.questions.length} questions</div>
        <div><div className="text-xs text-slate-500">Requested terms</div>{t.payment_terms} · {t.delivery_terms}</div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-medium">Vendors — headline comparison</h3>
          <button onClick={() => goTo("Comparison")} className="text-xs text-indigo-700 hover:underline">Open comparison grid →</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vendor</th><th className="px-4 py-2 font-medium">Response</th><th className="px-4 py-2 font-medium">Coverage</th>
              <th className="px-4 py-2 text-right font-medium">Annual (unit price)</th><th className="px-4 py-2 text-right font-medium">Annual (landed)</th>
              <th className="px-4 py-2 font-medium">Mandatory</th><th className="px-4 py-2 font-medium">Open ⚠</th>
            </tr>
          </thead>
          <tbody>
            {byVendor.map((v) => {
              const resp = bundle.responses.find((r) => r.vendor_id === v.vendor_id);
              const status = !resp ? "Not replied" : resp.processing_status !== "done" ? (resp.processing_status === "error" ? "Error reading" : "Processing…") : v.lines_not_quoted > 0 ? "Replied — incomplete" : "Replied";
              const nOpen = open.filter((i) => i.vendor_id === v.vendor_id).length;
              return (
                <tr key={v.vendor_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{v.name}</td>
                  <td className="px-4 py-2 text-xs">{status}{resp && <div className="text-slate-500">{dt(resp.received_at)}</div>}</td>
                  <td className="px-4 py-2 text-xs">{v.coverage_label}{v.lines_needs_input > 0 && <div className="text-amber-700">⚠ {v.lines_needs_input} need input</div>}{v.lines_priced > v.lines_priced_compliant && <div className="text-rose-700">{v.lines_priced - v.lines_priced_compliant} deviation(s) excluded</div>}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{v.lines_priced_compliant ? inrShort(v.total_unit_inr) : "—"}<div className="text-[11px] text-slate-500">on {v.lines_priced_compliant} lines</div></td>
                  <td className="px-4 py-2 text-right tabular-nums">{v.total_landed_inr != null ? inrShort(v.total_landed_inr) : <span className="text-xs text-amber-700">incomplete</span>}<div className="text-[11px] text-slate-500">{v.freight.status === "unknown" ? "freight unknown" : v.freight.text.startsWith("Excluded") ? "freight excluded" : v.freight.uplift_pct ? `freight +${v.freight.uplift_pct.toFixed(1)}%` : v.replied ? "freight incl." : ""}</div></td>
                  <td className="px-4 py-2 text-xs">{!v.replied ? "—" : v.mandatory_pass ? <span className="text-emerald-700">✓ Pass</span> : v.mandatory_failures.length ? <span className="text-rose-700">✗ Fail</span> : <span className="text-amber-700">? Unverified</span>}</td>
                  <td className="px-4 py-2 text-xs">{nOpen ? <button onClick={() => setVendorFilter(v.vendor_id)} className="text-amber-700 underline">⚠ {nOpen}</button> : "0"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 pb-3 text-[11px] text-slate-500">Totals cover different numbers of lines and are not directly comparable; ask the chat for a like-for-like comparison. Deviations and unresolved ⚠ lines are excluded from totals.</p>
      </section>

      {flags.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 font-medium">Key flags</h3>
          <ul className="space-y-1 text-sm">
            {flags.map((f, i) => (
              <li key={i} className={`rounded px-2 py-1 text-xs ${f.tone === "rose" ? "bg-rose-50 text-rose-900" : f.tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}>{f.text}</li>
            ))}
          </ul>
        </section>
      )}

      <section id="open-items" className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="font-medium">⚠ Open items <span className="ml-1 rounded-full bg-amber-100 px-2 text-xs text-amber-900">{open.length}</span></h3>
          <div className="flex items-center gap-3 text-xs">
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
              <option value="all">All vendors</option>
              {bundle.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nothing open. Every value on screen is either stated, converted by a formula, or confirmed by you.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${i.status === "open" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>⚠ {kindLabel(i)}</span>
                  <span className="text-slate-500">{vName(i.vendor_id)}</span>
                </div>
                <p className="mb-2 text-sm text-slate-800">{i.message}</p>
                <OpenItemForm rfxId={bundle.rfx.id} item={i} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
