"use client";

import { useMemo, useState } from "react";
import type { WorkspaceData } from "@/lib/workspace-data";
import type { Cell } from "@/lib/normalize";
import { inr, inrShort, STATE_META } from "./format";

export type Basis = "unit" | "landed";

function hoverText(c: Cell, vendorName: string): string {
  switch (c.state) {
    case "needs_input": return `${vendorName}: needs ${c.missing ?? "input"}. ${c.steps[0] ?? ""}. Click to supply it.`;
    case "not_quoted": return `${vendorName} did not quote this line.`;
    case "deviation": return `Offered spec differs: ${(c.deviation ?? []).map((d) => `${d.field} ${d.offered} vs ${d.requested} requested`).join("; ")}. Excluded from award totals by default.`;
    case "assumed": return `${c.steps.join(" → ")}`;
    default: return c.steps.join(" → ");
  }
}

export default function ComparisonGrid({ data, onOpenCell }: { data: WorkspaceData; onOpenCell: (c: Cell) => void }) {
  const { bundle, cmp } = data;
  const [basis, setBasis] = useState<Basis>("unit");
  const [includeDev, setIncludeDev] = useState(false);
  const [cat, setCat] = useState<string>("All");
  const cats = useMemo(() => ["All", ...Array.from(new Set(bundle.lines.map((l) => l.category ?? "Other")))], [bundle.lines]);
  const lines = bundle.lines.filter((l) => cat === "All" || (l.category ?? "Other") === cat);
  const vendors = bundle.vendors;
  const cellOf = (lineId: string, vendorId: string) => cmp.cells.find((c) => c.line_id === lineId && c.vendor_id === vendorId)!;
  const value = (c: Cell) => (basis === "unit" ? c.unit_inr : c.landed_inr);
  const counts = (c: Cell) => value(c) != null && c.state !== "needs_input" && (includeDev || c.state !== "deviation");
  const openKeys = new Set(bundle.openItems.filter((i) => i.status === "open").map((i) => i.key));

  const totals = vendors.map((v) => {
    let total = 0, n = 0, incomplete = 0;
    for (const l of lines) {
      const c = cellOf(l.id, v.id);
      if (counts(c)) { total += value(c)! * Number(l.annual_qty ?? 0); n++; }
      else if (basis === "landed" && c.unit_inr != null && c.state !== "needs_input" && (includeDev || c.state !== "deviation")) incomplete++;
    }
    return { vendor: v, total, n, incomplete };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(["unit", "landed"] as Basis[]).map((b) => (
            <button key={b} onClick={() => setBasis(b)} className={`rounded px-3 py-1 text-xs ${basis === b ? "bg-slate-900 text-white" : "text-slate-600"}`}>
              {b === "unit" ? "Unit price" : "Landed cost (incl. freight & discounts)"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <input type="checkbox" checked={includeDev} onChange={(e) => setIncludeDev(e.target.checked)} /> Include deviations
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-500">INR per RFx unit · lowest counted price per row highlighted · click any cell for its source</span>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {Object.entries(STATE_META).map(([k, m]) => (
          <span key={k} title={m.help} className={`rounded px-1.5 py-0.5 ring-1 ${m.cls}`}>{m.icon && <b className="mr-1">{m.icon}</b>}{m.label}</span>
        ))}
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900" title="Open question on this value">⚠ open item</span>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: "calc(100vh - 290px)" }}>
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 w-[300px] min-w-[260px] border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium text-slate-600">RFx line</th>
              {vendors.map((v) => {
                const s = cmp.vendors.find((x) => x.vendor_id === v.id)!;
                return (
                  <th key={v.id} className="min-w-[132px] border-b border-l border-slate-200 px-2 py-2 text-left font-medium text-slate-700">
                    <div className="truncate" title={v.name}>{v.name}</div>
                    <div className="mt-0.5 font-normal text-slate-500">
                      {s.mandatory_pass ? <span className="text-emerald-700">✓ mandatory</span> : s.replied ? <span className="text-rose-700" title={[...s.mandatory_failures, ...s.mandatory_unknown].join("\n")}>✗ mandatory</span> : "no reply"}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const rowCells = vendors.map((v) => cellOf(l.id, v.id));
              const counted = rowCells.filter(counts).map((c) => value(c)!);
              const min = counted.length ? Math.min(...counted) : null;
              return (
                <tr key={l.id} className="align-top">
                  <td className="sticky left-0 z-[5] border-b border-slate-100 bg-white px-2 py-1.5">
                    <div className="font-medium text-slate-800"><span className="mr-1 text-slate-400">{l.line_no}.</span>{l.description.split(",")[0]}</div>
                    <div className="text-[11px] text-slate-500">{Number(l.annual_qty).toLocaleString("en-IN")} {l.unit}/yr · {l.category}</div>
                  </td>
                  {rowCells.map((c) => {
                    const m = STATE_META[c.state];
                    const v = value(c);
                    const isMin = min != null && counts(c) && v === min;
                    const hasOpen = c.open_item_keys.some((k) => openKeys.has(k));
                    const vendorName = vendors.find((x) => x.id === c.vendor_id)!.name;
                    const awaiting = !cmp.vendors.find((x) => x.vendor_id === c.vendor_id)?.replied;
                    return (
                      <td key={c.vendor_id} className="border-b border-l border-slate-100 p-1">
                        <button onClick={() => onOpenCell(c)} className={`group relative w-full rounded px-1.5 py-1 text-left ring-1 ${m.cls} ${isMin ? "outline outline-2 outline-emerald-500" : ""} hover:brightness-95`}>
                          <div className="flex items-center justify-between gap-1">
                            <span className={`tabular-nums ${c.state === "not_quoted" ? "italic" : "font-medium"}`}>
                              {awaiting ? "Awaiting reply" : c.state === "not_quoted" ? "Not quoted" : c.state === "needs_input" ? "Needs input" : v != null ? inr(v) : basis === "landed" ? "Freight ?" : "—"}
                            </span>
                            <span className="flex items-center gap-0.5 text-[10px]">
                              {m.icon && <span title={m.label}>{m.icon}</span>}
                              {hasOpen && <span className="rounded bg-amber-200 px-0.5 text-amber-900">⚠</span>}
                            </span>
                          </div>
                          {basis === "landed" && c.state !== "not_quoted" && c.state !== "needs_input" && c.flags.includes("conditional_discount") && (
                            <div className="text-[10px] text-slate-500">discount pending</div>
                          )}
                          <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-72 rounded-md bg-slate-900 p-2 text-[11px] font-normal leading-snug text-white shadow-lg group-hover:block">
                            <b>{m.label}</b> — {hoverText(c, vendorName)}
                            {c.landed_steps.length > 0 && basis === "landed" && <><br />{c.landed_steps.join(" → ")}</>}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-50">
            <tr>
              <td className="sticky left-0 border-t border-slate-300 bg-slate-50 px-2 py-2 font-medium">
                Annual total ({basis === "unit" ? "unit price" : "landed"})<div className="text-[11px] font-normal text-slate-500">Σ price × annual qty over counted lines</div>
              </td>
              {totals.map((t) => (
                <td key={t.vendor.id} className="border-l border-t border-slate-300 px-2 py-2">
                  <div className="font-semibold tabular-nums">{t.n ? inrShort(t.total) : "—"}</div>
                  <div className="text-[11px] text-slate-600">covers {t.n}/{lines.length} lines</div>
                  {t.incomplete > 0 && <div className="text-[11px] text-amber-700">⚠ {t.incomplete} lines without freight</div>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Totals with different coverage are not comparable. Deviations are {includeDev ? "included" : "excluded"}. Conditional discounts are only applied once you confirm them. Unconfirmed interpretations (⚠) are included and flagged.
      </p>
    </div>
  );
}
