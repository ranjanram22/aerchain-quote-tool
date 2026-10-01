"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resolveOpenItem, dismissOpenItem, reopenOpenItem } from "@/app/actions/rfx";
import type { OpenItemRow } from "@/lib/types";
import { dt } from "./format";

const KIND_LABEL: Record<string, string> = {
  pieces_per_pack: "Pieces per pack",
  weight_per_piece: "Weight per piece",
  freight_amount: "Freight amount",
  fx_rate: "Exchange rate",
  confirm_interpretation: "Confirm interpretation",
  missing_line: "Missing lines",
  unanswered_question: "Unanswered questions",
  expired_cert: "Expired certificate",
  price_check: "Price check",
};

export function kindLabel(item: OpenItemRow) {
  const sub = (item.details as { subkind?: string } | null)?.subkind;
  if (sub === "conditional_discount") return "Conditional discount";
  if (sub === "deviation") return "Spec deviation";
  if (sub === "group_statement") return "Confirm scope";
  if (sub === "reference") return "“Same as last year”";
  if (sub === "reference_unresolved") return "Price needed";
  if (sub === "questionnaire") return "Unclear mandatory answer";
  if (sub === "low_confidence_extraction") return "Low-confidence reading";
  if (sub === "unmatched_item") return "Unmatched item";
  if (sub === "possible_deviation") return "Possible spec difference";
  return KIND_LABEL[item.kind] ?? item.kind;
}

function Btn(p: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }) {
  const { tone = "primary", className = "", ...rest } = p;
  const c = tone === "primary" ? "bg-indigo-600 text-white hover:bg-indigo-700" : tone === "danger" ? "border border-rose-300 text-rose-700 hover:bg-rose-50" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  return <button {...rest} className={`rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${c} ${className}`} />;
}

export default function OpenItemForm({ rfxId, item, onDone }: { rfxId: string; item: OpenItemRow; onDone?: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [val, setVal] = useState("");
  const [mode, setMode] = useState<"annual_inr" | "percent" | "included">("annual_inr");
  const d = (item.details ?? {}) as Record<string, unknown>;
  const sub = d.subkind as string | undefined;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Failed");
      else { setErr(null); onDone?.(); }
    });
  const resolve = (resolution: Record<string, unknown>) => run(() => resolveOpenItem(rfxId, item.id, resolution, note || null));
  const dismiss = () => run(() => dismissOpenItem(rfxId, item.id, note || null));
  // allowZero: freight only — 0 means "leave freight out" for this vendor.
  const num = (allowZero = false) => {
    const n = Number(val.replace(/,/g, ""));
    if (!val.trim() || !Number.isFinite(n) || n < 0 || (n === 0 && !allowZero)) { setErr(allowZero ? "Enter 0 or a positive number." : "Enter a positive number."); return null; }
    return n;
  };

  if (item.status !== "open") {
    const r = (item.resolution ?? {}) as Record<string, unknown>;
    return (
      <div className="text-xs text-slate-500">
        {item.status === "resolved" ? "Resolved" : "Dismissed"} by {item.resolved_by} · {dt(item.resolved_at)}
        {r.value != null && <> · {item.kind === "freight_amount" && Number(r.value) === 0 ? "freight excluded (0)" : <>value {String(r.value)}</>}</>}
        {r.price_inr != null && <> · ₹{String(r.price_inr)}</>}
        {r.mode != null && <> · {String(r.mode)}</>}
        {r.apply != null && <> · {r.apply ? "apply" : "do not apply"}</>}
        {r.accept != null && <> · {r.accept ? "accepted" : "rejected"}</>}
        {r.status != null && <> · marked {String(r.status)}</>}
        {r.note ? <> · “{String(r.note)}”</> : null}
        {r.auto ? <> · {String(r.auto)}</> : null}
        {item.resolved_by !== "system" && (
          <button disabled={pending} onClick={() => run(() => reopenOpenItem(rfxId, item.id))} className="ml-2 text-indigo-600 hover:underline">Reopen</button>
        )}
      </div>
    );
  }

  let control: React.ReactNode = null;
  const numberInput = (placeholder: string, suffix: string, submit: () => void) => (
    <div className="flex items-center gap-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" placeholder={placeholder}
        className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" />
      <span className="text-xs text-slate-500">{suffix}</span>
      <Btn disabled={pending} onClick={submit}>Save</Btn>
    </div>
  );

  if (item.kind === "pieces_per_pack") control = numberInput("e.g. 100", "pieces/sets per pack", () => { const n = num(); if (n) resolve({ value: n }); });
  else if (item.kind === "weight_per_piece") control = numberInput("e.g. 3.2", "kg per piece", () => { const n = num(); if (n) resolve({ value: n }); });
  else if (item.kind === "freight_amount")
    control = (
      <div className="flex flex-wrap items-center gap-2">
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="rounded border border-slate-300 px-2 py-1 text-xs">
          <option value="annual_inr">Annual freight (₹)</option>
          <option value="percent">% of order value</option>
          <option value="included">Included in prices</option>
        </select>
        {mode !== "included" && (
          <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" placeholder={mode === "percent" ? "e.g. 4" : "e.g. 1500000"} className="w-32 rounded border border-slate-300 px-2 py-1 text-xs" />
        )}
        <Btn disabled={pending} onClick={() => { if (mode === "included") resolve({ mode }); else { const n = num(true); if (n != null) resolve({ mode, value: n }); } }}>Save</Btn>
        {mode !== "included" && <span className="text-[11px] text-slate-500">Enter 0 to leave freight out of this vendor&apos;s landed cost.</span>}
      </div>
    );
  else if (sub === "conditional_discount")
    control = (
      <div className="flex gap-2">
        <Btn disabled={pending} onClick={() => resolve({ apply: true })}>We will meet the condition — apply</Btn>
        <Btn tone="ghost" disabled={pending} onClick={() => resolve({ apply: false })}>Don&apos;t apply</Btn>
      </div>
    );
  else if (sub === "possible_deviation")
    control = (
      <div className="flex gap-2">
        <Btn disabled={pending} onClick={() => resolve({ accept: true })}>Yes, it is a deviation (exclude)</Btn>
        <Btn tone="ghost" disabled={pending} onClick={dismiss}>No — same spec</Btn>
      </div>
    );
  else if (sub === "deviation")
    control = (
      <div className="flex gap-2">
        <Btn disabled={pending} onClick={() => resolve({ accept: true })}>Accept offered spec (include in awards)</Btn>
        <Btn tone="ghost" disabled={pending} onClick={dismiss}>Keep excluded</Btn>
      </div>
    );
  else if (sub === "questionnaire")
    control = (
      <div className="flex gap-2">
        <Btn disabled={pending} onClick={() => resolve({ status: "pass" })}>Mark pass</Btn>
        <Btn tone="danger" disabled={pending} onClick={() => resolve({ status: "fail" })}>Mark fail</Btn>
      </div>
    );
  else if (sub === "reference_unresolved") control = numberInput("e.g. 12.50", "₹ per RFx unit", () => { const n = num(); if (n) resolve({ price_inr: n }); });
  else if (item.kind === "confirm_interpretation" || item.kind === "price_check")
    control = (
      <div className="flex gap-2">
        <Btn disabled={pending} onClick={() => resolve({ accept: true })}>{item.kind === "price_check" ? "Price is correct" : "Yes, confirm"}</Btn>
        <Btn tone="ghost" disabled={pending} onClick={dismiss}>Leave unconfirmed</Btn>
      </div>
    );
  else if (item.kind === "fx_rate") control = <Link href="/" className="text-xs text-indigo-600 underline">Add the rate in Home → Admin → FX rates</Link>;
  else control = <Btn tone="ghost" disabled={pending} onClick={dismiss}>Acknowledge</Btn>;

  return (
    <div className="space-y-2">
      {control}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full max-w-sm rounded border border-slate-200 px-2 py-1 text-xs" />
      {err && <div className="text-xs text-rose-600">{err}</div>}
    </div>
  );
}
