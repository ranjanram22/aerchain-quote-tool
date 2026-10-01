"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readNdjson } from "@/lib/stream";

// Admin → System: wipe everything and reload the seed demo (vendor replies are
// re-read through the real pipeline, served from the extraction cache).
export default function ResetDemo() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const run = async () => {
    setBusy(true); setErr(null); setLog([]); setDone(false);
    try {
      const r = await fetch("/api/admin/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: typed }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? "Reset failed"); }
      const res = await readNdjson<{ failed: number }>(r, (t) => setLog((l) => [...l, t]));
      setDone(true);
      if (res.failed) setErr(`${res.failed} vendor reply could not be read — see the Responses tab.`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setTyped("");
    }
  };

  return (
    <div className="rounded-lg border border-rose-200 bg-white p-4 text-sm">
      <div className="mb-1 font-medium text-slate-700">Reset demo data</div>
      <p className="mb-3 text-xs text-slate-500">
        Deletes every RFx, vendor, product, price, response and ⚠ item, then reloads the seed demo: 5 vendors, the Chakan RFx and the 5 vendor replies, read through the real pipeline (from the cache, so usually about a minute and no AI calls).
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50">Reset demo data…</button>
      ) : (
        <div className="space-y-2">
          {!busy && !done && (
            <div className="flex items-center gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type RESET" className="w-32 rounded border border-slate-300 px-2 py-1 text-xs" />
              <button disabled={typed !== "RESET"} onClick={run} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">Reset now</button>
              <button onClick={() => setOpen(false)} className="text-xs text-slate-500">Cancel</button>
            </div>
          )}
          {(busy || log.length > 0) && (
            <div className="max-h-48 overflow-y-auto rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
              {log.map((l, i) => <div key={i}>{l}</div>)}
              {busy && <div className="animate-pulse text-indigo-600">working…</div>}
            </div>
          )}
          {done && !err && <div className="text-xs text-emerald-700">✓ Demo data restored. Open the RFx from the list above.</div>}
          {err && <div className="text-xs text-rose-600">{err}</div>}
        </div>
      )}
    </div>
  );
}
