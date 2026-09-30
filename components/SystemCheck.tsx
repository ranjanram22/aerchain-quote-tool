"use client";

import { useEffect, useState } from "react";

interface Health {
  openrouterKey: boolean;
  supabaseEnv: boolean;
  schema: boolean;
  bucket: boolean;
  error: string | null;
}

interface PingResult {
  task: string;
  model: string;
  ok: boolean;
  reply: string;
  latencyMs: number | null;
}

function Dot({ ok }: { ok: boolean | null }) {
  const color = ok === null ? "bg-slate-300" : ok ? "bg-emerald-500" : "bg-rose-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

export default function SystemCheck() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ping, setPing] = useState<PingResult[] | null>(null);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  async function runPing() {
    setPinging(true);
    setPing(null);
    try {
      const r = await fetch("/api/llm-ping", { method: "POST" });
      const j = await r.json();
      setPing(j.results);
    } catch {
      setPing([{ task: "ping", model: "-", ok: false, reply: "Request failed", latencyMs: null }]);
    } finally {
      setPinging(false);
    }
  }

  const rows: [string, boolean | null][] = [
    ["OpenRouter key set", health ? health.openrouterKey : null],
    ["Supabase keys set", health ? health.supabaseEnv : null],
    ["Database tables exist", health ? health.schema : null],
    ["File storage bucket exists", health ? health.bucket : null],
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="mb-3 font-medium text-slate-700">System check</div>
      <ul className="space-y-1.5">
        {rows.map(([label, ok]) => (
          <li key={label} className="flex items-center gap-2">
            <Dot ok={ok} /> {label}
          </li>
        ))}
      </ul>
      {health?.error && <p className="mt-2 text-xs text-rose-600">{health.error}</p>}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          onClick={runPing}
          disabled={pinging}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pinging ? "Pinging…" : "LLM ping"}
        </button>
        {ping && (
          <ul className="mt-3 space-y-1.5">
            {ping.map((p) => (
              <li key={p.task} className="flex items-start gap-2">
                <span className="mt-1"><Dot ok={p.ok} /></span>
                <span>
                  <span className="font-mono text-xs">{p.model}</span>
                  {" — "}
                  {p.ok ? `ok (${((p.latencyMs ?? 0) / 1000).toFixed(1)}s)` : <span className="text-rose-600">{p.reply}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
