"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceData } from "@/lib/workspace-data";
import { sendFollowup, addVendorToRfx, mapQuoteLine } from "@/app/actions/rfx";
import OpenItemForm, { kindLabel } from "./OpenItemForm";
import { dt, inr, pct, STATE_META } from "./format";

const ACCEPT = ".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg,.heic,.heif,.webp,.txt,.eml";

function Upload({ rfxId, vendorId, label }: { rfxId: string; vendorId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const submit = async () => {
    const fd = new FormData();
    fd.set("vendor_id", vendorId);
    if (text.trim()) fd.set("email_text", text);
    for (const f of Array.from(fileRef.current?.files ?? [])) fd.append("files", f);
    if (!text.trim() && !fd.getAll("files").length) return setErr("Add a file or paste the email text.");
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/rfx/${rfxId}/responses`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload failed");
      setOpen(false); setText("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!open) return <button onClick={() => setOpen(true)} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">{label}</button>;
  return (
    <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="text-xs font-medium">Add what the vendor sent — any format. Files and email text are read together.</div>
      <input ref={fileRef} type="file" multiple accept={ACCEPT} className="block text-xs" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste the email body (optional)" className="w-full rounded border border-slate-300 p-2 text-xs" />
      <div className="flex items-center gap-2">
        <button disabled={busy} onClick={submit} className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">{busy ? "Uploading…" : "Upload & read"}</button>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500">Cancel</button>
        {err && <span className="text-xs text-rose-600">{err}</span>}
      </div>
      <p className="text-[11px] text-slate-500">Reading takes 1–3 minutes. A newer reply supersedes the previous one; your confirmations carry over where the value is unchanged.</p>
    </div>
  );
}

function MapLine({ rfxId, quoteLineId, lines }: { rfxId: string; quoteLineId: string; lines: { line_no: number; description: string }[] }) {
  const [n, setN] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-1">
      <select value={n} onChange={(e) => setN(e.target.value)} className="max-w-[110px] rounded border border-amber-300 px-1 py-0.5 text-[10px]">
        <option value="">⚠ map to…</option>
        {lines.map((l) => <option key={l.line_no} value={l.line_no}>{l.line_no}. {l.description.split(",")[0]}</option>)}
      </select>
      <button disabled={!n || pending} onClick={() => start(async () => { await mapQuoteLine(rfxId, quoteLineId, Number(n)); })} className="text-[10px] text-indigo-700 disabled:opacity-40">Map</button>
    </span>
  );
}

type VersionData = {
  response: { id: string; version: number; received_at: string; raw_email_text: string | null; superseded_by: string | null; processing_status: string };
  files: { id: string; filename: string; kind: string; url: string | null }[];
  lines: { line_no: number | null; vendor_line_text: string | null; price_value: number | null; price_currency: string | null; price_unit_as_written: string | null; value_origin: string }[];
  extraction: { model: string; overall_confidence: number | null; created_at: string } | null;
  terms: { freight: { note?: string } | null; payment_terms: { text?: string } | null } | null;
};

// Earlier replies from the same vendor: kept, viewable, and compared with the current one.
function History({ data, vendorId }: { data: WorkspaceData; vendorId: string }) {
  const versions = data.history.filter((h) => h.vendor_id === vendorId).sort((a, b) => b.version - a.version);
  const current = data.bundle.responses.find((r) => r.vendor_id === vendorId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [v, setV] = useState<VersionData | null>(null);
  const [loading, setLoading] = useState(false);
  if (versions.length < 2) return null;
  const show = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setV(null); setLoading(true);
    try { setV(await (await fetch(`/api/responses/${id}/version`)).json()); } finally { setLoading(false); }
  };
  const cur = current ? data.bundle.quoteLines.filter((q) => q.response_id === current.id) : [];
  const fmtP = (x: { price_value: number | null; price_currency: string | null; price_unit_as_written: string | null } | undefined) => (x && x.price_value != null ? `${x.price_currency ?? ""} ${x.price_value} ${x.price_unit_as_written ?? ""}`.trim() : "—");
  return (
    <details className="rounded-md border border-slate-200 text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">Version history ({versions.length} replies — newest is used; older ones are kept)</summary>
      <ul className="divide-y divide-slate-100">
        {versions.map((h) => (
          <li key={h.id} className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span>
                <b>Version {h.version}</b> · received {dt(h.received_at)} · {h.id === current?.id ? <span className="text-emerald-700">current</span> : <span className="text-slate-500">superseded</span>}
                {h.processing_status !== "done" && <span className="text-amber-700"> · {h.processing_status}</span>}
              </span>
              {h.id !== current?.id && <button onClick={() => show(h.id)} className="text-indigo-700 hover:underline">{openId === h.id ? "Hide" : "View & compare"}</button>}
            </div>
            {openId === h.id && (
              <div className="mt-2 space-y-2 rounded bg-slate-50 p-2">
                {loading && <div className="text-slate-500">Loading…</div>}
                {v && (
                  <>
                    <div className="text-slate-600">
                      Files: {v.files.length ? v.files.map((f, i) => <span key={f.id}>{i ? ", " : ""}{f.url ? <a className="text-indigo-700 underline" href={f.url} target="_blank" rel="noreferrer">{f.filename}</a> : f.filename}</span>) : "none"}
                      {v.response.raw_email_text && " · email text"}
                      {v.extraction && <> · read by {v.extraction.model} ({pct(v.extraction.overall_confidence)})</>}
                    </div>
                    {v.terms?.freight?.note && <div className="text-slate-600">Freight then: “{v.terms.freight.note}”</div>}
                    <table className="w-full text-[11px]">
                      <thead className="text-left text-slate-500"><tr><th className="px-1 py-0.5 font-medium">RFx</th><th className="px-1 py-0.5 font-medium">This version</th><th className="px-1 py-0.5 font-medium">Current version</th><th className="px-1 py-0.5 font-medium" /></tr></thead>
                      <tbody>
                        {[...new Set([...v.lines.map((l) => l.line_no), ...cur.map((q) => q.line_no)].filter((n): n is number => n != null))].sort((a, b) => a - b).map((n) => {
                          const old = v.lines.find((l) => l.line_no === n);
                          const now = cur.find((q) => q.line_no === n);
                          const changed = fmtP(old) !== fmtP(now);
                          const has = (x: typeof old | typeof now) => !!x && x.price_value != null;
                          return (
                            <tr key={n} className={`border-t border-slate-200 ${changed ? "bg-amber-50" : ""}`}>
                              <td className="px-1 py-0.5">{n}</td><td className="px-1 py-0.5">{fmtP(old)}</td><td className="px-1 py-0.5">{fmtP(now)}</td>
                              <td className="px-1 py-0.5 text-amber-700">{changed ? (has(old) && has(now) ? "changed" : has(old) ? "dropped" : "new") : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-slate-500">Values as written by the vendor (before conversion). Only the current version feeds the comparison; your earlier confirmations carry over where the value is unchanged.</p>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Followup({ data, vendorId }: { data: WorkspaceData; vendorId: string }) {
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const gen = async () => {
    setLoading(true); setErr(null); setSent(false);
    try {
      const r = await fetch(`/api/rfx/${data.bundle.rfx.id}/followup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vendor_id: vendorId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (!j.body) setErr("No gaps to follow up on.");
      else setDraft({ subject: j.subject, body: j.body });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-2">
      <button onClick={gen} disabled={loading} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">
        {loading ? "Drafting…" : draft ? "Re-draft follow-up email" : "Draft follow-up email from gaps"}
      </button>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      {sent && <div className="text-xs text-emerald-700">Sent (simulated) — see Outbox.</div>}
      {draft && !sent && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-medium" />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={12} className="w-full rounded border border-slate-300 p-2 font-mono text-[11px]" />
          <button disabled={pending} onClick={() => start(async () => { const r = await sendFollowup(data.bundle.rfx.id, vendorId, data.vendorEmails[vendorId] ?? null, draft.subject, draft.body); if (r.ok) { setSent(true); setDraft(null); } else setErr(r.error); })}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50">Send (simulated)</button>
        </div>
      )}
    </div>
  );
}

export default function Responses({ data }: { data: WorkspaceData }) {
  const { bundle, cmp } = data;
  const router = useRouter();
  const processing = bundle.responses.some((r) => r.processing_status === "pending" || r.processing_status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [processing, router]);
  const [focus, setFocus] = useState<Record<string, string>>({});
  const [late, setLate] = useState("");
  const [addPending, startAdd] = useTransition();

  return (
    <div className="space-y-6">
      {data.otherVendors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-xs text-slate-600">
          Reply from a vendor not on the invite list?
          <select value={late} onChange={(e) => setLate(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
            <option value="">Choose vendor…</option>
            {data.otherVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button disabled={!late || addPending} onClick={() => startAdd(async () => { await addVendorToRfx(bundle.rfx.id, late); setLate(""); })} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50">Add to this RFx</button>
          <span className="text-slate-400">New vendors: Home → Admin → Vendors.</span>
        </div>
      )}
      {bundle.vendors.map((v) => {
        const resp = bundle.responses.find((r) => r.vendor_id === v.id);
        const files = resp ? bundle.files.filter((f) => f.response_id === resp.id) : [];
        const meta = resp ? data.extractionMeta.find((e) => e.response_id === resp.id) : undefined;
        const summary = cmp.vendors.find((s) => s.vendor_id === v.id)!;
        const gaps = bundle.openItems.filter((i) => i.vendor_id === v.id && i.status === "open");
        const qls = resp ? bundle.quoteLines.filter((q) => q.response_id === resp.id).sort((a, b) => (a.line_no ?? 999) - (b.line_no ?? 999)) : [];
        const previewId = focus[v.id] ?? files.find((f) => f.kind === "quote")?.id ?? files[0]?.id;
        const pf = files.find((f) => f.id === previewId);
        const url = pf ? data.fileUrls[pf.id] : undefined;
        const versions = data.history.filter((h) => h.vendor_id === v.id);
        return (
          <section key={v.id} className="rounded-lg border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="font-medium">{v.name}</h3>
                <div className="text-xs text-slate-500">
                  {!resp ? "Not replied" : `Received ${dt(resp.received_at)} · version ${resp.version}`}
                  {resp && ` · ${summary.coverage_label}`}{versions.length > 1 && <span className="text-slate-400"> · see Version history below</span>}
                </div>
              </div>
              <Upload rfxId={bundle.rfx.id} vendorId={v.id} label={resp ? "Upload a newer reply" : "Add response"} />
            </header>

            {resp && (resp.processing_status === "pending" || resp.processing_status === "processing") && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-indigo-700"><span className="h-2 w-2 animate-pulse rounded-full bg-indigo-600" /> Reading {files.length} file(s){resp.raw_email_text ? " and the email text" : ""}… this page updates automatically.{resp.error && <span className="text-amber-700"> {resp.error}</span>}</div>
            )}
            {resp?.processing_status === "error" && (
              <div className="m-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                Couldn&apos;t read this reply: {resp.error}
                <button onClick={async () => { await fetch(`/api/responses/${resp.id}/retry`, { method: "POST" }); router.refresh(); }} className="ml-2 underline">Try again</button>
              </div>
            )}

            {resp && resp.processing_status === "done" && resp.error && (
              <div className="mx-4 mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                ⚠ Part of this reply couldn&apos;t be read: {resp.error}. Below is what we got — please check the extracted values, or ask the vendor to resend.
              </div>
            )}
            {resp && resp.processing_status === "done" && (
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {resp.raw_email_text && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px]">✉ email text</span>}
                    {files.map((f) => (
                      <button key={f.id} onClick={() => setFocus({ ...focus, [v.id]: f.id })} className={`rounded px-2 py-0.5 text-[11px] ring-1 ${f.id === previewId ? "bg-indigo-50 ring-indigo-300" : "bg-white ring-slate-200"}`}>
                        {f.processing_status === "error" ? "⚠ " : ""}{f.filename} <span className="text-slate-400">· {f.kind.replace("_", " ")}</span>
                      </button>
                    ))}
                  </div>
                  {resp.raw_email_text && (!pf || files.length === 0) && <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-[11px]">{resp.raw_email_text}</pre>}
                  {pf && url && (/\.(heic|heif)$/i.test(pf.filename) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${pf.id}/preview`} alt={pf.filename} className="max-h-[520px] w-full rounded border border-slate-200 object-contain" />
                  ) : /\.(png|jpe?g|webp|gif)$/i.test(pf.filename) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={pf.filename} className="max-h-[520px] w-full rounded border border-slate-200 object-contain" />
                  ) : /\.pdf$/i.test(pf.filename) ? (
                    <iframe src={url} title={pf.filename} className="h-[520px] w-full rounded border border-slate-200" />
                  ) : (
                    <div>
                      <iframe src={`/api/files/${pf.id}/preview`} title={pf.filename} className="h-[520px] w-full rounded border border-slate-200 bg-white" />
                      <a href={url} className="text-[11px] text-indigo-700 underline" target="_blank" rel="noreferrer">Download original {pf.filename}</a>
                    </div>
                  ))}
                  {resp.raw_email_text && files.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-slate-600">Email text</summary><pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px]">{resp.raw_email_text}</pre></details>}
                </div>

                <div className="space-y-3">
                  {meta && (
                    <div className="rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
                      Read by <b>{meta.model}</b> · overall confidence {pct(meta.overall_confidence)} · {Math.round((meta.latency_ms ?? 0) / 1000)}s
                      {meta.attempts.length > 1 && <> · {meta.attempts.length} attempts ({meta.attempts.map((a) => `${a.model.split("/")[1]} ${a.ok ? "ok" : "failed"}`).join(", ")})</>}
                      {meta.notes.length > 0 && (
                        <details className="mt-1"><summary className="cursor-pointer">AI notes ({meta.notes.length})</summary><ul className="mt-1 list-disc pl-4">{meta.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>
                      )}
                    </div>
                  )}
                  <div className="max-h-[360px] overflow-auto rounded border border-slate-200">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                        <tr><th className="px-2 py-1 font-medium">RFx</th><th className="px-2 py-1 font-medium">Vendor&apos;s text</th><th className="px-2 py-1 font-medium">As written</th><th className="px-2 py-1 font-medium">→ ₹/unit</th><th className="px-2 py-1 font-medium">Conf.</th></tr>
                      </thead>
                      <tbody>
                        {qls.map((q) => {
                          const c = cmp.cells.find((x) => x.vendor_id === v.id && x.line_no === q.line_no);
                          const m = c ? STATE_META[c.state] : null;
                          return (
                            <tr key={q.id} className="border-t border-slate-100 align-top">
                              <td className="px-2 py-1">{q.line_no ?? (q.price_value != null ? <MapLine rfxId={bundle.rfx.id} quoteLineId={q.id} lines={bundle.lines} /> : "—")}</td>
                              <td className="px-2 py-1" title={q.provenance?.snippet}>{q.vendor_line_text}<div className="text-slate-400">{q.provenance?.locator}</div></td>
                              <td className="px-2 py-1 whitespace-nowrap">{q.price_currency} {q.price_value} <span className="text-slate-500">{q.price_unit_as_written}</span></td>
                              <td className="px-2 py-1 whitespace-nowrap">{c?.unit_inr != null ? inr(c.unit_inr) : "—"} {m && <span className={`ml-1 rounded px-1 ring-1 ${m.cls}`}>{m.icon || m.label}</span>}</td>
                              <td className={`px-2 py-1 ${(q.confidence ?? 1) < 0.7 ? "font-semibold text-amber-700" : ""}`}>{pct(q.confidence)}</td>
                            </tr>
                          );
                        })}
                        {qls.length === 0 && <tr><td colSpan={5} className="px-2 py-3 text-slate-500">No priced lines found in this reply.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-md border border-slate-200 p-2 text-[11px]">
                    <b>Commercial terms:</b> freight — {summary.freight.text}
                    {summary.discounts.map((d, i) => <div key={i}>discount — {d.text} [{d.status}]</div>)}
                    {(() => { const t = bundle.terms.find((x) => x.response_id === resp.id); return t ? <>
                      {t.payment_terms && <div>payment — {t.payment_terms.text}</div>}
                      {t.validity && <div>validity — {t.validity.text}</div>}
                      {t.lead_time && <div>lead time — {t.lead_time.text}</div>}
                      {t.gst && <div>GST — {t.gst.text}</div>}
                    </> : null; })()}
                  </div>
                </div>

                <div className="space-y-3 lg:col-span-2">
                  <h4 className="text-sm font-medium">Gaps &amp; issues {gaps.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 text-xs text-amber-900">{gaps.length}</span>}</h4>
                  {gaps.length === 0 ? <p className="text-xs text-slate-500">None open.</p> : (
                    <ul className="space-y-2">
                      {gaps.map((i) => (
                        <li key={i.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                          <div className="text-[11px] font-semibold text-amber-900">⚠ {kindLabel(i)}</div>
                          <p className="mb-1.5 text-xs">{i.message}</p>
                          <OpenItemForm rfxId={bundle.rfx.id} item={i} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <History data={data} vendorId={v.id} />
                  <Followup data={data} vendorId={v.id} />
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
