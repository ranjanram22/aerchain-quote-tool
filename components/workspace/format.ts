export const inr = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const inrShort = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
  return inr(n, 0);
};

export const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const d8 = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export const STATE_META: Record<string, { label: string; cls: string; icon: string; help: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-900 ring-emerald-300", icon: "✓", help: "Buyer confirmed or edited" },
  extracted: { label: "Extracted", cls: "bg-white text-slate-900 ring-slate-200", icon: "", help: "Stated in the source, read with high confidence" },
  converted: { label: "Converted", cls: "bg-sky-50 text-sky-950 ring-sky-200", icon: "⇄", help: "Deterministic unit or currency conversion applied" },
  needs_input: { label: "Needs input", cls: "bg-amber-50 text-amber-900 ring-amber-300", icon: "⚠", help: "Cannot be computed without a missing fact" },
  assumed: { label: "Assumed", cls: "bg-violet-50 text-violet-950 ring-violet-200", icon: "≈", help: "Came from an interpretation (e.g. 'same as last year')" },
  deviation: { label: "Deviation", cls: "bg-rose-50 text-rose-900 ring-rose-200", icon: "≠", help: "Offered spec differs from requested; excluded from awards by default" },
  not_quoted: { label: "Not quoted", cls: "bg-slate-50 text-slate-400 ring-slate-200", icon: "", help: "Vendor did not quote this line" },
};
