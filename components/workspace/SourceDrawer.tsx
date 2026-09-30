"use client";

import { useState, useTransition } from "react";
import type { WorkspaceData } from "@/lib/workspace-data";
import type { Cell } from "@/lib/normalize";
import { editQuoteLine } from "@/app/actions/rfx";
import OpenItemForm, { kindLabel } from "./OpenItemForm";
import { inr, pct, STATE_META } from "./format";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1 text-xs">
      <div className="text-slate-500">{k}</div>
      <div className="text-slate-900">{v}</div>
    </div>
  );
}

function EditForm({ data, cell, onDone }: { data: WorkspaceData; cell: Cell; onDone: () => void }) {
  const q = data.bundle.quoteLines.find((x) => x.id === cell.source?.quote_line_id)!;
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    price_value: String(q.price_value ?? ""),
    price_currency: q.price_currency ?? "INR",
    qty_basis: q.qty_basis ?? "per_unit",
    basis_count: String(q.basis_count ?? ""),
    pieces_per_pack: String(q.pieces_per_pack ?? ""),
    weight_per_piece_kg: String(q.weight_per_piece_kg ?? ""),
    note: "",
  });
  const n = (s: string) => (s.trim() === "" ? null : Number(s));
  const save = () =>
    start(async () => {
      const price = n(f.price_value);
      if (price == null || !Number.isFinite(price) || price <= 0) return setErr("Enter a positive price.");
      const r = await editQuoteLine(data.bundle.rfx.id, q.id, {
        price_value: price, price_currency: f.price_currency.toUpperCase(), qty_basis: f.qty_basis, basis_count: n(f.basis_count),
        pieces_per_pack: n(f.pieces_per_pack), weight_per_piece_kg: n(f.weight_per_piece_kg),
      }, f.note || null);
      if (!r.ok) setErr(r.error); else onDone();
    });
  const inp = "rounded border border-slate-300 px-2 py-1 text-xs w-full";
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium">Correct the extracted value</div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-slate-600">Price as written<input className={inp} value={f.price_value} onChange={(e) => setF({ ...f, price_value: e.target.value })} /></label>
        <label className="text-[11px] text-slate-600">Currency<input className={inp} value={f.price_currency} onChange={(e) => setF({ ...f, price_currency: e.target.value })} /></label>
        <label className="text-[11px] text-slate-600">Basis
          <select className={inp} value={f.qty_basis} onChange={(e) => setF({ ...f, qty_basis: e.target.value })}>
            <option value="per_unit">per unit</option><option value="per_n">per N units</option><option value="per_pack">per pack/box/bundle</option>
            <option value="per_kg">per kg</option><option value="per_tonne">per tonne</option>
          </select>
        </label>
        {f.qty_basis === "per_n" && <label className="text-[11px] text-slate-600">N<input className={inp} value={f.basis_count} onChange={(e) => setF({ ...f, basis_count: e.target.value })} /></label>}
        {f.qty_basis === "per_pack" && <label className="text-[11px] text-slate-600">Pieces per pack<input className={inp} value={f.pieces_per_pack} onChange={(e) => setF({ ...f, pieces_per_pack: e.target.value })} /></label>}
        {(f.qty_basis === "per_kg" || f.qty_basis === "per_tonne") && <label className="text-[11px] text-slate-600">Kg per piece<input className={inp} value={f.weight_per_piece_kg} onChange={(e) => setF({ ...f, weight_per_piece_kg: e.target.value })} /></label>}
      </div>
      <input className={inp} placeholder="Reason for the correction (logged)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <div className="flex items-center gap-2">
        <button disabled={pending} onClick={save} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50">{pending ? "Saving…" : "Save correction"}</button>
        <button onClick={onDone} className="text-xs text-slate-500">Cancel</button>
        {err && <span className="text-xs text-rose-600">{err}</span>}
      </div>
    </div>
  );
}

export default function SourceDrawer({ data, cell, onClose }: { data: WorkspaceData; cell: Cell; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const line = data.bundle.lines.find((l) => l.id === cell.line_id)!;
  const vendor = data.bundle.vendors.find((v) => v.id === cell.vendor_id)!;
  const m = STATE_META[cell.state];
  const s = cell.source;
  const file = s?.file ? data.bundle.files.find((f) => f.filename === s.file && f.response_id === s.response_id) : undefined;
  const url = file ? data.fileUrls[file.id] : undefined;
  const isImage = file && /\.(png|jpe?g|webp|gif)$/i.test(file.filename);
  const items = data.bundle.openItems
    .filter((i) => (i.key && cell.open_item_keys.includes(i.key)) || (i.status !== "open" && i.resolved_by !== "system" && ((s?.quote_line_id && i.quote_line_id === s.quote_line_id) || (i.rfx_line_id === cell.line_id && i.vendor_id === cell.vendor_id))))
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open"));
  const q = s?.quote_line_id ? data.bundle.quoteLines.find((x) => x.id === s.quote_line_id) : undefined;
  const ext = data.extractionMeta.find((e) => e.response_id === s?.response_id);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/20" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-xs text-slate-500">Line {line.line_no} · {vendor.name}</div>
            <h2 className="text-base font-semibold">{line.description}</h2>
            <div className="text-xs text-slate-500">RFx unit: {line.unit} · {Number(line.annual_qty).toLocaleString("en-IN")}/yr</div>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700">×</button>
        </div>

        <div className={`mb-4 rounded-md px-3 py-2 ring-1 ${m.cls}`}>
          <div className="text-xs font-semibold">{m.icon} {m.label}</div>
          <div className="text-xs">{m.help}{cell.missing ? ` — missing: ${cell.missing}` : ""}</div>
          {cell.unit_inr != null && <div className="mt-1 text-sm">Unit price: <b>{inr(cell.unit_inr)}</b>{cell.net_inr != null && cell.net_inr !== cell.unit_inr && <> · after discount {inr(cell.net_inr)}</>} · Landed: <b>{cell.landed_inr != null ? inr(cell.landed_inr) : "unknown (freight)"}</b></div>}
          {cell.flags.length > 0 && <div className="mt-1 text-[11px] text-slate-600">Flags: {cell.flags.join(", ").replace(/_/g, " ")}</div>}
        </div>

        {items.length > 0 && (
          <section className="mb-4 space-y-3">
            {items.map((i) => (
              <div key={i.id} className={`rounded-md border p-3 ${i.status === "open" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-xs font-semibold ${i.status === "open" ? "text-amber-900" : "text-slate-600"}`}>{i.status === "open" ? "⚠" : "✓"} {kindLabel(i)}</div>
                <p className="mb-2 text-xs text-slate-800">{i.message}</p>
                <OpenItemForm rfxId={data.bundle.rfx.id} item={i} />
              </div>
            ))}
          </section>
        )}

        {cell.state === "not_quoted" && !s ? (
          <p className="text-sm text-slate-600">{vendor.name} did not quote this line{cmp(data, cell.vendor_id) ? "" : " (no reply yet)"}. It is shown as “Not quoted”, never as zero, and is excluded from totals.</p>
        ) : s ? (
          <>
            <section className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Source</h3>
              <Row k="File" v={s.file ? (url ? <a className="text-indigo-700 underline" href={url} target="_blank" rel="noreferrer">{s.file}</a> : s.file) : "—"} />
              <Row k="Location" v={s.locator ?? "—"} />
              <Row k="Verbatim" v={s.snippet ? <span className="rounded bg-yellow-100 px-1 font-mono text-[11px]">“{s.snippet}”</span> : "—"} />
              {s.vendor_line_text && <Row k="Vendor's item" v={s.vendor_line_text} />}
              {s.raw_value != null && <Row k="As written" v={`${s.raw_currency ?? ""} ${s.raw_value} ${s.raw_unit ?? ""}`} />}
              {s.match_reason && <Row k="Matched because" v={s.match_reason} />}
              {s.reference && <Row k="Vendor phrase" v={<span className="rounded bg-yellow-100 px-1">“{s.reference.phrase}”</span>} />}
              {s.last_year && <Row k="Last-year record" v={`${s.last_year.contract_ref ?? ""} · ${inr(s.last_year.price_inr)}/${s.last_year.unit} · ${s.last_year.valid_from} → ${s.last_year.valid_to}`} />}
              <Row k="Origin" v={s.kind === "buyer" ? "Buyer input (corrected)" : s.origin} />
              <Row k="Confidence" v={<>value {pct(s.confidence)}{s.match_confidence != null && <> · line match {pct(s.match_confidence)}</>}</>} />
              <Row k="Read by" v={s.model ?? ext?.model ?? "—"} />
              {q?.offered_spec && <Row k="Offered spec" v={<span className="font-mono text-[11px]">{JSON.stringify(q.offered_spec)}</span>} />}
              {cell.deviation && <Row k="Deviation" v={cell.deviation.map((d) => `${d.field}: offered ${d.offered}, requested ${d.requested}`).join("; ")} />}
            </section>

            <section className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">How the number was computed</h3>
              <ol className="list-decimal space-y-1 pl-5 text-xs">
                {cell.steps.map((st, i) => <li key={i}>{st}</li>)}
                {cell.landed_steps.map((st, i) => <li key={`l${i}`}>{st}</li>)}
              </ol>
            </section>

            {q && !editing && <button onClick={() => setEditing(true)} className="mb-4 rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">Edit extracted value</button>}
            {q && editing && <div className="mb-4"><EditForm data={data} cell={cell} onDone={() => setEditing(false)} /></div>}

            {url && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Original file</h3>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={file!.filename} className="w-full rounded border border-slate-200" />
                ) : file?.filename.toLowerCase().endsWith(".pdf") ? (
                  <iframe src={url} className="h-[480px] w-full rounded border border-slate-200" title={file.filename} />
                ) : (
                  <>
                    <iframe src={`/api/files/${file!.id}/preview`} className="h-[420px] w-full rounded border border-slate-200" title={file!.filename} />
                    <a className="text-xs text-indigo-700 underline" href={url} target="_blank" rel="noreferrer">Download {file!.filename}</a>
                  </>
                )}
                {s.snippet && <p className="mt-1 text-[11px] text-slate-500">Look for: “{s.snippet}” at {s.locator}</p>}
              </section>
            )}
          </>
        ) : null}
      </aside>
    </div>
  );
}

function cmp(data: WorkspaceData, vendorId: string) {
  return data.bundle.responses.some((r) => r.vendor_id === vendorId);
}
