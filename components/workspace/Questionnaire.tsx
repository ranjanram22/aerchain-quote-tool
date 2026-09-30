"use client";

import type { WorkspaceData } from "@/lib/workspace-data";
import { d8 } from "./format";

const ST: Record<string, { cls: string; label: string }> = {
  pass: { cls: "bg-emerald-50 text-emerald-800", label: "✓ Pass" },
  fail: { cls: "bg-rose-50 text-rose-800", label: "✗ Fail" },
  unknown: { cls: "bg-amber-50 text-amber-800", label: "? Unclear" },
  not_answered: { cls: "bg-slate-50 text-slate-500", label: "— Not answered" },
};

export default function Questionnaire({ data }: { data: WorkspaceData }) {
  const { bundle, cmp } = data;
  const fileUrl = (name?: string, responseId?: string | null) => {
    const f = bundle.files.find((x) => x.filename === name && (!responseId || x.response_id === responseId));
    return f ? data.fileUrls[f.id] : undefined;
  };
  return (
    <div className="space-y-6">
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-[280px] border-b border-slate-200 px-2 py-2 text-left font-medium text-slate-600">Question</th>
              {bundle.vendors.map((v) => <th key={v.id} className="min-w-[150px] border-b border-l border-slate-200 px-2 py-2 text-left font-medium">{v.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {bundle.questions.map((q) => (
              <tr key={q.id} className="align-top">
                <td className="border-b border-slate-100 px-2 py-2">
                  <div className="font-medium">Q{q.q_no}. {q.text}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {q.requirement.mandatory || q.requirement.must ? <span className="font-semibold text-rose-700">Mandatory</span> : "Optional"}
                    {q.requirement.type === "min" && ` · min ${q.requirement.value} ${q.requirement.unit}`}
                    {q.requirement.type === "max" && ` · max ${q.requirement.value} ${q.requirement.unit}`}
                  </div>
                </td>
                {bundle.vendors.map((v) => {
                  const r = cmp.questions.find((x) => x.question_id === q.id && x.vendor_id === v.id)!;
                  const s = ST[r.status];
                  const resp = bundle.responses.find((x) => x.vendor_id === v.id);
                  const url = fileUrl(r.provenance?.file, resp?.id);
                  return (
                    <td key={v.id} className="border-b border-l border-slate-100 px-2 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
                      <div className="mt-1 text-[11px] text-slate-700">{r.reason}</div>
                      {r.answer_text && <div className="mt-1 line-clamp-3 text-[11px] text-slate-500" title={r.answer_text}>“{r.answer_text}”</div>}
                      {r.provenance?.file && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          {url ? <a href={url} target="_blank" rel="noreferrer" className="underline">{r.provenance.file}</a> : r.provenance.file}{r.provenance.locator ? ` · ${r.provenance.locator}` : ""}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h3 className="border-b border-slate-100 px-4 py-3 font-medium">Attachments</h3>
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500"><tr><th className="px-4 py-2 font-medium">Vendor</th><th className="px-4 py-2 font-medium">File</th><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Extracted facts</th><th className="px-4 py-2 font-medium">Valid on RFx date?</th></tr></thead>
          <tbody>
            {bundle.files.map((f) => {
              const resp = bundle.responses.find((r) => r.id === f.response_id);
              const v = bundle.vendors.find((x) => x.id === resp?.vendor_id);
              const facts = bundle.attachments.filter((a) => a.response_file_id === f.id);
              return (
                <tr key={f.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2">{v?.name}</td>
                  <td className="px-4 py-2">{data.fileUrls[f.id] ? <a className="text-indigo-700 underline" href={data.fileUrls[f.id]} target="_blank" rel="noreferrer">{f.filename}</a> : f.filename}</td>
                  <td className="px-4 py-2">{f.kind.replace("_", " ")}</td>
                  <td className="px-4 py-2">
                    {facts.length ? facts.map((a) => (
                      <div key={a.id}>{String(a.details?.standard ?? a.fact_type)} · {a.cert_no ?? "no number"} · {a.issuer ?? ""} · valid until {d8(a.valid_until)}</div>
                    )) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2">
                    {facts.map((a) => (
                      <div key={a.id} className={a.is_valid_on_rfx_date === false ? "font-medium text-rose-700" : a.is_valid_on_rfx_date ? "text-emerald-700" : "text-slate-500"}>
                        {a.is_valid_on_rfx_date === false ? "✗ Expired" : a.is_valid_on_rfx_date ? "✓ Valid" : "Unknown"}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
