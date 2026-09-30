// Deterministic analysis tools. Every number the chat can show comes from
// here (via lib/normalize.ts). The model only chooses tools and writes prose.
import { normalize, compactList, type Comparison, type Cell, type NormalizeOptions } from "../normalize";
import type { RfxBundle } from "../types";
import type { AnswerTable, AnswerChart } from "./types";

export type Basis = "unit_price" | "landed";

export interface VendorFilter {
  vendors?: string[];
  exclude?: string[];
  must_pass?: string[] | "all_mandatory";
}

export interface CommonParams {
  basis?: Basis;
  include_deviations?: boolean;
  include_unconfirmed?: boolean;
  vendor_filter?: VendorFilter;
  categories?: string[];
  line_nos?: number[];
}

export interface ToolResult {
  summary: string; // one line for "How this was computed"
  data: unknown; // compact JSON for the model
  tables: AnswerTable[];
  charts: AnswerChart[];
  included: string[];
  excluded: string[];
  caveats: string[];
  open_item_keys: string[];
}

export interface Ctx {
  bundle: RfxBundle;
  cmp: Comparison;
  tables: Map<string, AnswerTable>;
  nextTableId: () => string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r0 = (n: number) => Math.round(n);
const fmtInr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// ---------- helpers ----------
function vendorByName(ctx: Ctx, name: string) {
  const n = name.toLowerCase().trim();
  return ctx.bundle.vendors.find((v) => v.name.toLowerCase() === n) ?? ctx.bundle.vendors.find((v) => v.name.toLowerCase().includes(n) || n.includes(v.name.toLowerCase().split(" ")[0]));
}

function resolveVendors(ctx: Ctx, cmp: Comparison, f: VendorFilter | undefined, requireReply = true) {
  const excluded: string[] = [];
  let ids = ctx.bundle.vendors.map((v) => v.id);
  const name = (id: string) => ctx.bundle.vendors.find((v) => v.id === id)!.name;
  if (f?.vendors?.length) {
    const want = f.vendors.map((n) => vendorByName(ctx, n)?.id).filter(Boolean) as string[];
    ids = ids.filter((id) => want.includes(id));
  }
  if (f?.exclude?.length) {
    const ex = f.exclude.map((n) => vendorByName(ctx, n)?.id).filter(Boolean) as string[];
    for (const id of ex) if (ids.includes(id)) excluded.push(`${name(id)}: excluded by request`);
    ids = ids.filter((id) => !ex.includes(id));
  }
  if (requireReply) {
    for (const id of [...ids]) {
      const s = cmp.vendors.find((v) => v.vendor_id === id)!;
      if (!s.replied || s.processing_status !== "done") { excluded.push(`${name(id)}: no processed reply`); ids = ids.filter((x) => x !== id); }
    }
  }
  if (f?.must_pass === "all_mandatory") {
    for (const id of [...ids]) {
      const s = cmp.vendors.find((v) => v.vendor_id === id)!;
      if (!s.mandatory_pass) {
        excluded.push(`${name(id)}: does not pass all mandatory questionnaire items (${[...s.mandatory_failures, ...s.mandatory_unknown].join("; ")})`);
        ids = ids.filter((x) => x !== id);
      }
    }
  } else if (Array.isArray(f?.must_pass) && f.must_pass.length) {
    for (const code of f.must_pass) {
      const c = code.toLowerCase().replace(/[^a-z0-9]/g, "");
      const qs = ctx.bundle.questions.filter((q) => (q.code ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(c) || q.text.toLowerCase().includes(code.toLowerCase()));
      for (const q of qs) {
        for (const id of [...ids]) {
          const r = cmp.questions.find((x) => x.question_id === q.id && x.vendor_id === id);
          if (r?.status !== "pass") { excluded.push(`${name(id)}: Q${q.q_no} (${q.code}) is ${r?.status ?? "unknown"} — ${r?.reason ?? ""}`); ids = ids.filter((x) => x !== id); }
        }
      }
    }
  }
  return { ids, excluded };
}

function scopeLines(ctx: Ctx, p: CommonParams) {
  return ctx.bundle.lines.filter((l) => (!p.line_nos?.length || p.line_nos.includes(l.line_no)) && (!p.categories?.length || p.categories.some((c) => (l.category ?? "").toLowerCase().includes(c.toLowerCase()))));
}

function priceOf(c: Cell, basis: Basis): number | null {
  return basis === "landed" ? c.landed_inr : c.unit_inr;
}

function eligible(c: Cell, p: CommonParams): { ok: boolean; why?: string } {
  const basis = p.basis ?? "unit_price";
  if (c.state === "not_quoted") return { ok: false, why: "not quoted" };
  if (c.state === "needs_input") return { ok: false, why: "needs input" };
  if (c.state === "deviation" && !p.include_deviations) return { ok: false, why: "spec deviation" };
  if (p.include_unconfirmed === false && (c.state === "assumed" || c.flags.includes("low_confidence"))) return { ok: false, why: "unconfirmed interpretation" };
  if (priceOf(c, basis) == null) return { ok: false, why: basis === "landed" ? "freight unknown" : "no price" };
  return { ok: true };
}

function cellsFor(cmp: Comparison, lineId: string, ids: string[]) {
  return cmp.cells.filter((c) => c.line_id === lineId && ids.includes(c.vendor_id));
}

function flagKeys(cells: Cell[], bundle: RfxBundle) {
  const open = new Set(bundle.openItems.filter((i) => i.status === "open").map((i) => i.key));
  return [...new Set(cells.flatMap((c) => c.open_item_keys).filter((k) => open.has(k)))];
}

function standardCaveats(ctx: Ctx, cmp: Comparison, p: CommonParams, used: Cell[]) {
  const cav: string[] = [];
  const basis = p.basis ?? "unit_price";
  const assumed = used.filter((c) => c.state === "assumed");
  const low = used.filter((c) => c.flags.includes("low_confidence"));
  const pend = used.filter((c) => c.flags.includes("conditional_discount"));
  const vName = (id: string) => ctx.bundle.vendors.find((v) => v.id === id)?.name ?? id;
  if (assumed.length) cav.push(`${assumed.length} value(s) are assumptions (e.g. "same as last year"), not stated prices.`);
  if (low.length) cav.push(`${low.length} value(s) are unconfirmed interpretations (⚠).`);
  if (pend.length && basis === "landed") cav.push(`Conditional discounts are not applied for: ${[...new Set(pend.map((c) => vName(c.vendor_id)))].join(", ")}.`);
  if (basis === "unit_price") cav.push("Unit prices exclude freight and discounts; use landed cost for the full picture.");
  const dev = cmp.cells.filter((c) => c.state === "deviation");
  if (dev.length && !p.include_deviations) cav.push(`${dev.length} spec-deviation offer(s) excluded (${dev.map((c) => `${vName(c.vendor_id)} line ${c.line_no}`).join(", ")}).`);
  if (basis === "landed") {
    const unk = cmp.vendors.filter((v) => v.replied && v.freight.status === "unknown");
    if (unk.length) cav.push(`Freight unknown for ${unk.map((v) => v.name).join(", ")} — landed cost not computable for them.`);
  }
  return cav;
}

function lastYearBaseline(ctx: Ctx) {
  // Baseline = the incumbent's last-year price (vendor with the most last-year
  // records); falls back to the lowest other last-year price for that line.
  const counts = new Map<string, number>();
  for (const r of ctx.bundle.lastYear) counts.set(r.vendor_id, (counts.get(r.vendor_id) ?? 0) + 1);
  const incumbent = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const m = new Map<string, { price: number; vendor: string; ref: string | null }>();
  for (const l of ctx.bundle.lines) {
    const recs = ctx.bundle.lastYear.filter((r) => r.line_key === l.line_key && r.unit === l.unit);
    const pick = recs.find((r) => r.vendor_id === incumbent) ?? recs.sort((a, b) => a.price_inr - b.price_inr)[0];
    if (pick) m.set(l.id, { price: Number(pick.price_inr), vendor: ctx.bundle.vendors.find((v) => v.id === pick.vendor_id)?.name ?? "", ref: pick.contract_ref });
  }
  return { m, incumbent: ctx.bundle.vendors.find((v) => v.id === incumbent)?.name ?? null };
}

function table(ctx: Ctx, t: Omit<AnswerTable, "id">): AnswerTable {
  const full = { ...t, id: ctx.nextTableId() };
  ctx.tables.set(full.id, full);
  return full;
}

function cmpWith(ctx: Ctx, opts: NormalizeOptions | null): Comparison {
  return opts ? normalize(ctx.bundle, opts) : ctx.cmp;
}

// ---------- tools ----------
export function get_rfx_overview(ctx: Ctx): ToolResult {
  const { bundle, cmp } = ctx;
  const open = bundle.openItems.filter((i) => i.status === "open");
  const rows = cmp.vendors.map((v) => ({
    vendor: v.name,
    replied: v.replied ? (v.lines_not_quoted ? "Replied — incomplete" : "Replied") : "Not replied",
    coverage: v.coverage_label,
    lines_needs_input: v.lines_needs_input,
    unit_total_inr: v.lines_priced_compliant ? r0(v.total_unit_inr) : null,
    landed_total_inr: v.total_landed_inr != null ? r0(v.total_landed_inr) : null,
    freight: v.freight.text,
    mandatory: v.mandatory_pass ? "pass" : v.mandatory_failures.length ? "fail" : v.replied ? "unverified" : "—",
    open_items: open.filter((i) => i.vendor_id === v.vendor_id).length,
  }));
  const t = table(ctx, {
    title: "RFx overview by vendor",
    columns: [
      { key: "vendor", label: "Vendor" }, { key: "replied", label: "Status" }, { key: "coverage", label: "Coverage" },
      { key: "unit_total_inr", label: "Annual (unit)", format: "inr_short" }, { key: "landed_total_inr", label: "Annual (landed)", format: "inr_short" },
      { key: "mandatory", label: "Mandatory" }, { key: "open_items", label: "Open ⚠", format: "int" },
    ],
    rows,
    note: "Totals cover different numbers of lines; not directly comparable.",
  });
  return {
    summary: `Overview: ${bundle.lines.length} lines, ${bundle.vendors.length} invited, ${bundle.responses.length} replied, ${open.length} open items`,
    data: { rfx: bundle.rfx.title, rfx_date: bundle.rfx.rfx_date, lines: bundle.lines.length, questions: bundle.questions.length, invited: bundle.vendors.length, replied: bundle.responses.length, open_items: open.length, vendors: rows, table_id: t.id },
    tables: [t], charts: [], included: [], excluded: [], caveats: ["Totals are over each vendor's own priced lines; coverage differs."],
    open_item_keys: [],
  };
}

export function get_comparison(ctx: Ctx, p: CommonParams): ToolResult {
  const basis = p.basis ?? "unit_price";
  const { ids, excluded } = resolveVendors(ctx, ctx.cmp, p.vendor_filter, false);
  const lines = scopeLines(ctx, p);
  const names = ids.map((id) => ctx.bundle.vendors.find((v) => v.id === id)!.name);
  const rows = lines.map((l) => {
    const row: Record<string, string | number | null> = { line: l.line_no, item: l.description.split(",")[0], qty: Number(l.annual_qty) };
    for (const id of ids) {
      const c = ctx.cmp.cells.find((x) => x.line_id === l.id && x.vendor_id === id)!;
      const v = priceOf(c, basis);
      const name = ctx.bundle.vendors.find((x) => x.id === id)!.name;
      row[name] = c.state === "not_quoted" ? "Not quoted" : c.state === "needs_input" ? "⚠ needs input" : v != null ? r2(v) : "freight unknown";
      row[`${name} state`] = c.state;
    }
    return row;
  });
  const t = table(ctx, {
    title: `Comparison (${basis === "landed" ? "landed cost" : "unit price"}, ₹ per RFx unit)`,
    columns: [{ key: "line", label: "Line", format: "int" }, { key: "item", label: "Item" }, ...names.map((n) => ({ key: n, label: n, format: "inr" as const }))],
    rows,
  });
  const used = ctx.cmp.cells.filter((c) => ids.includes(c.vendor_id) && lines.some((l) => l.id === c.line_id));
  return {
    summary: `Comparison grid for ${lines.length} lines × ${ids.length} vendors (${basis})`,
    data: { basis, rows, table_id: t.id },
    tables: [t], charts: [], included: names, excluded, caveats: standardCaveats(ctx, ctx.cmp, p, used), open_item_keys: flagKeys(used, ctx.bundle),
  };
}

export function get_vendor_profile(ctx: Ctx, p: { vendor: string }): ToolResult {
  const v = vendorByName(ctx, p.vendor);
  if (!v) return err(`No vendor matching "${p.vendor}". Vendors: ${ctx.bundle.vendors.map((x) => x.name).join(", ")}`);
  const s = ctx.cmp.vendors.find((x) => x.vendor_id === v.id)!;
  const resp = ctx.bundle.responses.find((r) => r.vendor_id === v.id);
  const terms = resp ? ctx.bundle.terms.find((t) => t.response_id === resp.id) : undefined;
  const qs = ctx.cmp.questions.filter((q) => q.vendor_id === v.id).map((q) => ({ q: `Q${q.q_no} ${q.code}`, mandatory: q.mandatory, status: q.status, reason: q.reason }));
  const certs = resp ? ctx.bundle.attachments.filter((a) => a.response_id === resp.id).map((a) => ({ type: a.fact_type, cert_no: a.cert_no, valid_until: a.valid_until, valid_on_rfx_date: a.is_valid_on_rfx_date })) : [];
  const cells = ctx.cmp.cells.filter((c) => c.vendor_id === v.id);
  const assumptions = cells.filter((c) => c.state === "assumed" || c.flags.includes("inferred") || c.flags.includes("low_confidence")).map((c) => `line ${c.line_no}: ${c.state}${c.flags.length ? " (" + c.flags.join(", ") + ")" : ""}`);
  const open = ctx.bundle.openItems.filter((i) => i.vendor_id === v.id && i.status === "open");
  const t = table(ctx, {
    title: `${v.name} — questionnaire`,
    columns: [{ key: "q", label: "Question" }, { key: "status", label: "Status" }, { key: "reason", label: "Detail" }],
    rows: qs.map((q) => ({ q: q.q + (q.mandatory ? " (mandatory)" : ""), status: q.status, reason: q.reason })),
  });
  return {
    summary: `Profile of ${v.name}`,
    data: {
      vendor: v.name, replied: s.replied, coverage: s.coverage_label, lines_needs_input: s.lines_needs_input, lines_not_quoted: s.lines_not_quoted,
      unit_total_inr: r0(s.total_unit_inr), landed_total_inr: s.total_landed_inr != null ? r0(s.total_landed_inr) : null, freight: s.freight, discounts: s.discounts,
      payment_terms: terms?.payment_terms?.text ?? null, validity: terms?.validity?.text ?? null, lead_time: terms?.lead_time?.text ?? null, gst: terms?.gst?.text ?? null,
      mandatory_pass: s.mandatory_pass, mandatory_failures: s.mandatory_failures, mandatory_unknown: s.mandatory_unknown, questionnaire: qs, certificates: certs,
      assumptions_ledger: assumptions, open_items: open.map((o) => o.message), table_id: t.id,
    },
    tables: [t], charts: [], included: [v.name], excluded: [], caveats: [], open_item_keys: open.map((o) => o.key!).filter(Boolean),
  };
}

export function list_open_items(ctx: Ctx, p: { vendor?: string; kind?: string }): ToolResult {
  const v = p.vendor ? vendorByName(ctx, p.vendor) : undefined;
  const items = ctx.bundle.openItems.filter((i) => i.status === "open" && (!v || i.vendor_id === v.id) && (!p.kind || i.kind === p.kind || (i.details as { subkind?: string } | null)?.subkind === p.kind));
  const vName = (id: string | null) => ctx.bundle.vendors.find((x) => x.id === id)?.name ?? "—";
  const t = table(ctx, {
    title: "Open items",
    columns: [{ key: "vendor", label: "Vendor" }, { key: "kind", label: "Type" }, { key: "message", label: "What is needed" }],
    rows: items.map((i) => ({ vendor: vName(i.vendor_id), kind: ((i.details as { subkind?: string } | null)?.subkind ?? i.kind).replace(/_/g, " "), message: i.message })),
  });
  return {
    summary: `Listed ${items.length} open items${v ? ` for ${v.name}` : ""}`,
    data: { count: items.length, items: items.map((i) => ({ vendor: vName(i.vendor_id), kind: i.kind, subkind: (i.details as { subkind?: string } | null)?.subkind, message: i.message })), table_id: t.id },
    tables: [t], charts: [], included: [], excluded: [], caveats: [], open_item_keys: items.map((i) => i.key!).filter(Boolean),
  };
}

export function rank_vendors(ctx: Ctx, p: CommonParams & { what_if?: NormalizeOptions }): ToolResult {
  const cmp = cmpWith(ctx, p.what_if ?? null);
  const basis = p.basis ?? "unit_price";
  const { ids, excluded } = resolveVendors(ctx, cmp, p.vendor_filter);
  const lines = scopeLines(ctx, p);
  const used: Cell[] = [];
  const per = ids.map((id) => {
    let total = 0, n = 0;
    for (const l of lines) {
      const c = cmp.cells.find((x) => x.line_id === l.id && x.vendor_id === id)!;
      if (eligible(c, p).ok) { total += priceOf(c, basis)! * Number(l.annual_qty); n++; used.push(c); }
    }
    return { id, name: ctx.bundle.vendors.find((v) => v.id === id)!.name, total, n };
  });
  // Like-for-like: lines every candidate prices
  const common = lines.filter((l) => ids.every((id) => eligible(cmp.cells.find((x) => x.line_id === l.id && x.vendor_id === id)!, p).ok));
  const lfl = ids.map((id) => common.reduce((s, l) => s + priceOf(cmp.cells.find((x) => x.line_id === l.id && x.vendor_id === id)!, basis)! * Number(l.annual_qty), 0));
  const rows = per.map((x, i) => ({ vendor: x.name, coverage: `${x.n}/${lines.length}`, lines_priced: x.n, total_inr: x.n ? r0(x.total) : null, like_for_like_inr: common.length ? r0(lfl[i]) : null }))
    .sort((a, b) => (a.like_for_like_inr ?? Infinity) - (b.like_for_like_inr ?? Infinity));
  rows.forEach((r, i) => ((r as Record<string, unknown>).rank_like_for_like = common.length ? i + 1 : null));
  const t = table(ctx, {
    title: `Vendor ranking (${basis === "landed" ? "landed cost" : "unit price"})`,
    columns: [
      { key: "rank_like_for_like", label: "Rank", format: "int" }, { key: "vendor", label: "Vendor" }, { key: "coverage", label: "Coverage" },
      { key: "total_inr", label: "Annual total (own coverage)", format: "inr_short" }, { key: "like_for_like_inr", label: `Like-for-like (${common.length} common lines)`, format: "inr_short" },
    ],
    rows,
    note: `Like-for-like = only the ${common.length} lines every listed vendor priced (${compactList(common.map((l) => l.line_no))}).`,
  });
  return {
    summary: `Ranked ${ids.length} vendors on ${basis}; like-for-like over ${common.length} common lines`,
    data: { basis, common_lines: common.map((l) => l.line_no), ranking: rows, table_id: t.id },
    tables: [t], charts: [], included: per.map((x) => x.name), excluded, caveats: standardCaveats(ctx, cmp, p, used), open_item_keys: flagKeys(used, ctx.bundle),
  };
}

function cheapestAssignment(ctx: Ctx, cmp: Comparison, p: CommonParams, ids: string[]) {
  const basis = p.basis ?? "unit_price";
  const lines = scopeLines(ctx, p);
  const used: Cell[] = [];
  const out = lines.map((l) => {
    const cs = cellsFor(cmp, l.id, ids).filter((c) => eligible(c, p).ok).sort((a, b) => priceOf(a, basis)! - priceOf(b, basis)!);
    const best = cs[0];
    if (best) used.push(best);
    return { line: l, best, runner: cs[1] };
  });
  return { lines, out, used };
}

export function award_cheapest_per_line(ctx: Ctx, p: CommonParams & { what_if?: NormalizeOptions }): ToolResult {
  const cmp = cmpWith(ctx, p.what_if ?? null);
  const basis = p.basis ?? "unit_price";
  const { ids, excluded } = resolveVendors(ctx, cmp, p.vendor_filter);
  const { lines, out, used } = cheapestAssignment(ctx, cmp, p, ids);
  const vName = (id: string) => ctx.bundle.vendors.find((v) => v.id === id)!.name;
  const { m: ly, incumbent } = lastYearBaseline(ctx);
  let total = 0, lyTotal = 0, lyLines = 0;
  const rows = out.map(({ line, best, runner }) => {
    const qty = Number(line.annual_qty);
    const price = best ? priceOf(best, basis)! : null;
    const value = price != null ? price * qty : null;
    if (value != null) total += value;
    const base = ly.get(line.id);
    if (price != null && base) { lyTotal += base.price * qty; lyLines++; }
    return {
      line: line.line_no, item: line.description.split(",")[0], qty,
      winner: best ? vName(best.vendor_id) : "No eligible quote",
      price_inr: price != null ? r2(price) : null,
      annual_value_inr: value != null ? r0(value) : null,
      runner_up: runner ? `${vName(runner.vendor_id)} ${fmtInr(r2(priceOf(runner, basis)!))}` : "—",
      last_year_inr: base ? r2(base.price) : null,
      state: best?.state ?? "—",
    };
  });
  const covered = rows.filter((r) => r.price_inr != null).length;
  const uncovered = rows.filter((r) => r.price_inr == null).map((r) => r.line);
  // Single best vendor over the SAME covered lines (like-for-like)
  const coveredIds = out.filter((o) => o.best).map((o) => o.line.id);
  const singles = ids.map((id) => {
    let t = 0, n = 0;
    for (const lid of coveredIds) {
      const c = cmp.cells.find((x) => x.line_id === lid && x.vendor_id === id)!;
      if (eligible(c, p).ok) { t += priceOf(c, basis)! * Number(ctx.bundle.lines.find((l) => l.id === lid)!.annual_qty); n++; }
    }
    return { vendor: vName(id), total: t, n };
  });
  const full = singles.filter((s) => s.n === coveredIds.length).sort((a, b) => a.total - b.total);
  const bestSingle = full[0] ?? null;
  const byVendor = new Map<string, { lines: number; value: number }>();
  for (const r of rows) if (r.annual_value_inr != null) {
    const e = byVendor.get(r.winner) ?? { lines: 0, value: 0 };
    e.lines++; e.value += r.annual_value_inr; byVendor.set(r.winner, e);
  }
  const split = [...byVendor.entries()].map(([vendor, e]) => ({ vendor, lines: e.lines, value_inr: r0(e.value), share_pct: r2((e.value / total) * 100) })).sort((a, b) => b.value_inr - a.value_inr);
  const lyCompareTotal = rows.reduce((s, r) => s + (r.last_year_inr != null && r.annual_value_inr != null ? r.annual_value_inr : 0), 0);
  const summaryData = {
    basis, lines_in_scope: lines.length, lines_covered: covered, uncovered_lines: uncovered,
    total_inr: r0(total),
    best_single_vendor: bestSingle ? { vendor: bestSingle.vendor, total_inr: r0(bestSingle.total), saving_vs_single_inr: r0(bestSingle.total - total), saving_vs_single_pct: r2(((bestSingle.total - total) / bestSingle.total) * 100) } : null,
    single_vendors_not_covering_all: singles.filter((s) => s.n < coveredIds.length).map((s) => `${s.vendor} (${s.n}/${coveredIds.length})`),
    vs_last_year: lyLines ? { lines_compared: lyLines, last_year_inr: r0(lyTotal), this_award_inr: r0(lyCompareTotal), change_inr: r0(lyCompareTotal - lyTotal), change_pct: r2(((lyCompareTotal - lyTotal) / lyTotal) * 100), baseline: `last-year contract prices (incumbent ${incumbent ?? "—"} where available)` } : null,
    split,
  };
  const t1 = table(ctx, {
    title: `Cheapest per line (${basis === "landed" ? "landed cost" : "unit price"})`,
    columns: [
      { key: "line", label: "Line", format: "int" }, { key: "item", label: "Item" }, { key: "winner", label: "Award to" },
      { key: "price_inr", label: "₹/unit", format: "inr" }, { key: "annual_value_inr", label: "Annual value", format: "inr_short" },
      { key: "runner_up", label: "Runner-up" }, { key: "last_year_inr", label: "Last year ₹/unit", format: "inr" },
    ],
    rows,
    note: `Total ${fmtInr(r0(total))} over ${covered}/${lines.length} lines.${uncovered.length ? ` No eligible quote: lines ${compactList(uncovered)}.` : ""}`,
  });
  const t2 = table(ctx, {
    title: "Award split by vendor",
    columns: [{ key: "vendor", label: "Vendor" }, { key: "lines", label: "Lines", format: "int" }, { key: "value_inr", label: "Annual value", format: "inr_short" }, { key: "share_pct", label: "Share", format: "pct" }],
    rows: split,
  });
  const cav = standardCaveats(ctx, cmp, p, used);
  if (uncovered.length) cav.push(`No eligible quote for lines ${compactList(uncovered)} — total excludes them.`);
  if (summaryData.vs_last_year) cav.push(`Last-year comparison covers only the ${lyLines} lines with a last-year price.`);
  return {
    summary: `Cheapest eligible vendor per line on ${basis}, ${covered}/${lines.length} lines covered`,
    data: { ...summaryData, table_ids: [t1.id, t2.id] },
    tables: [t1, t2], charts: [], included: ids.map(vName), excluded, caveats: cav, open_item_keys: flagKeys(used, ctx.bundle),
  };
}

export function award_split(ctx: Ctx, p: CommonParams & { max_vendors?: number; max_share_pct?: number; min_share_pct?: number; lock_lines?: { line: number; vendor: string }[]; what_if?: NormalizeOptions }): ToolResult {
  const cmp = cmpWith(ctx, p.what_if ?? null);
  const basis = p.basis ?? "unit_price";
  const { ids, excluded } = resolveVendors(ctx, cmp, p.vendor_filter);
  const lines = scopeLines(ctx, p);
  const maxV = Math.max(1, Math.min(p.max_vendors ?? ids.length, ids.length));
  const vName = (id: string) => ctx.bundle.vendors.find((v) => v.id === id)!.name;
  const price = (lid: string, vid: string) => { const c = cmp.cells.find((x) => x.line_id === lid && x.vendor_id === vid)!; return eligible(c, p).ok ? priceOf(c, basis)! : null; };
  const locks = new Map<number, string>();
  for (const lk of p.lock_lines ?? []) { const v = vendorByName(ctx, lk.vendor); if (v) locks.set(lk.line, v.id); }

  type Sol = { subset: string[]; assign: Map<string, string>; cost: number; covered: number; feasible: boolean; note: string };
  let best: Sol | null = null;
  // Exhaustive over vendor subsets (≤ 2^n, n ≤ ~8), cheapest line assignment
  // within each subset, then greedy repair for share constraints.
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const subset = ids.filter((_, i) => mask & (1 << i));
    if (subset.length > maxV) continue;
    if ([...locks.values()].some((v) => !subset.includes(v))) continue;
    const assign = new Map<string, string>();
    for (const l of lines) {
      const lock = locks.get(l.line_no);
      if (lock) { if (price(l.id, lock) != null) assign.set(l.id, lock); continue; }
      let bv: string | null = null, bp = Infinity;
      for (const v of subset) { const pr = price(l.id, v); if (pr != null && pr < bp) { bp = pr; bv = v; } }
      if (bv) assign.set(l.id, bv);
    }
    const qty = (lid: string) => Number(lines.find((l) => l.id === lid)!.annual_qty);
    const value = () => { const m = new Map<string, number>(); for (const [lid, v] of assign) m.set(v, (m.get(v) ?? 0) + price(lid, v)! * qty(lid)); return m; };
    let feasible = true, note = "";
    for (let iter = 0; iter < 200 && (p.max_share_pct || p.min_share_pct); iter++) {
      const vals = value(); const tot = [...vals.values()].reduce((a, b) => a + b, 0);
      const over = p.max_share_pct ? [...vals.entries()].find(([, x]) => (x / tot) * 100 > p.max_share_pct! + 1e-9) : undefined;
      const under = p.min_share_pct ? subset.find((v) => ((vals.get(v) ?? 0) / tot) * 100 < p.min_share_pct! - 1e-9) : undefined;
      if (!over && !under) break;
      let bestMove: { lid: string; to: string; delta: number } | null = null;
      for (const [lid, from] of assign) {
        if (locks.has(lines.find((l) => l.id === lid)!.line_no)) continue;
        if (over && from !== over[0]) continue;
        for (const to of subset) {
          if (to === from || (under && to !== under)) continue;
          const pt = price(lid, to); if (pt == null) continue;
          const delta = (pt - price(lid, from)!) * qty(lid);
          if (!bestMove || delta < bestMove.delta) bestMove = { lid, to, delta };
        }
      }
      if (!bestMove) { feasible = false; note = "share constraints could not be met with this vendor set"; break; }
      assign.set(bestMove.lid, bestMove.to);
    }
    const cost = [...assign.entries()].reduce((s, [lid, v]) => s + price(lid, v)! * qty(lid), 0);
    const sol: Sol = { subset, assign, cost, covered: assign.size, feasible, note };
    if (!sol.feasible) continue;
    if (!best || sol.covered > best.covered || (sol.covered === best.covered && sol.cost < best.cost)) best = sol;
  }
  if (!best) return err("No vendor combination satisfies these constraints.");
  const rows = lines.map((l) => {
    const v = best!.assign.get(l.id);
    const pr = v ? price(l.id, v) : null;
    return { line: l.line_no, item: l.description.split(",")[0], vendor: v ? vName(v) : "Not covered", price_inr: pr != null ? r2(pr) : null, annual_value_inr: pr != null ? r0(pr * Number(l.annual_qty)) : null };
  });
  const byV = new Map<string, number>();
  rows.forEach((r) => r.annual_value_inr != null && byV.set(r.vendor, (byV.get(r.vendor) ?? 0) + r.annual_value_inr));
  const split = [...byV.entries()].map(([vendor, value]) => ({ vendor, lines: rows.filter((r) => r.vendor === vendor).length, value_inr: value, share_pct: r2((value / best!.cost) * 100) }));
  const t1 = table(ctx, { title: `Constrained split award (max ${maxV} vendor${maxV > 1 ? "s" : ""}${p.max_share_pct ? `, max share ${p.max_share_pct}%` : ""}${p.min_share_pct ? `, min share ${p.min_share_pct}%` : ""})`, columns: [{ key: "vendor", label: "Vendor" }, { key: "lines", label: "Lines", format: "int" }, { key: "value_inr", label: "Annual value", format: "inr_short" }, { key: "share_pct", label: "Share", format: "pct" }], rows: split, note: `Total ${fmtInr(r0(best.cost))} over ${best.covered}/${lines.length} lines.` });
  const t2 = table(ctx, { title: "Line assignment", columns: [{ key: "line", label: "Line", format: "int" }, { key: "item", label: "Item" }, { key: "vendor", label: "Vendor" }, { key: "price_inr", label: "₹/unit", format: "inr" }, { key: "annual_value_inr", label: "Annual value", format: "inr_short" }], rows });
  const used = [...best.assign.entries()].map(([lid, v]) => cmp.cells.find((c) => c.line_id === lid && c.vendor_id === v)!);
  const cav = standardCaveats(ctx, cmp, p, used);
  cav.push("Method: every combination of eligible vendors is tried; within each, each line goes to the cheapest vendor, then lines are moved at least extra cost until share limits hold. Best = most lines covered, then lowest total.");
  const unc = rows.filter((r) => r.price_inr == null).map((r) => r.line);
  if (unc.length) cav.push(`Lines ${compactList(unc)} not covered by the chosen vendors.`);
  return {
    summary: `Split award: ${best.subset.map(vName).join(", ")}; ${best.covered}/${lines.length} lines`,
    data: { basis, vendors: best.subset.map(vName), total_inr: r0(best.cost), lines_covered: best.covered, uncovered_lines: unc, split, table_ids: [t1.id, t2.id] },
    tables: [t1, t2], charts: [], included: ids.map(vName), excluded, caveats: cav, open_item_keys: flagKeys(used, ctx.bundle),
  };
}

export function compare_to_last_year(ctx: Ctx, p: CommonParams): ToolResult {
  const basis = p.basis ?? "unit_price";
  const { ids, excluded } = resolveVendors(ctx, ctx.cmp, p.vendor_filter);
  const { m: ly, incumbent } = lastYearBaseline(ctx);
  const vName = (id: string) => ctx.bundle.vendors.find((v) => v.id === id)!.name;
  const lines = scopeLines(ctx, p).filter((l) => ly.has(l.id));
  const used: Cell[] = [];
  const rows = lines.map((l) => {
    const base = ly.get(l.id)!;
    const row: Record<string, string | number | null> = { line: l.line_no, item: l.description.split(",")[0], last_year_inr: r2(base.price) };
    let bestP: number | null = null, bestV = "";
    for (const id of ids) {
      const c = ctx.cmp.cells.find((x) => x.line_id === l.id && x.vendor_id === id)!;
      if (!eligible(c, p).ok) { row[vName(id)] = null; continue; }
      const pr = priceOf(c, basis)!; used.push(c);
      row[vName(id)] = r2(pr);
      if (bestP == null || pr < bestP) { bestP = pr; bestV = vName(id); }
    }
    row.best_new_inr = bestP != null ? r2(bestP) : null;
    row.best_new_vendor = bestV || "—";
    row.change_pct = bestP != null ? r2(((bestP - base.price) / base.price) * 100) : null;
    return row;
  });
  const t = table(ctx, {
    title: `This year vs last year (${basis === "landed" ? "landed" : "unit price"}, ₹/unit)`,
    columns: [{ key: "line", label: "Line", format: "int" }, { key: "item", label: "Item" }, { key: "last_year_inr", label: "Last year", format: "inr" }, ...ids.map((id) => ({ key: vName(id), label: vName(id), format: "inr" as const })), { key: "best_new_vendor", label: "Best new" }, { key: "change_pct", label: "Best vs LY", format: "pct" }],
    rows,
    note: `Last-year baseline: incumbent ${incumbent ?? "—"}'s contract price where available, else the lowest last-year price on record.`,
  });
  const cheaper = rows.filter((r) => r.change_pct != null && (r.change_pct as number) < 0).length;
  const dearer = rows.filter((r) => r.change_pct != null && (r.change_pct as number) > 0).length;
  return {
    summary: `Compared ${lines.length} lines with last-year prices`,
    data: { basis, lines_with_last_year: lines.length, best_new_cheaper_than_last_year: cheaper, best_new_dearer_than_last_year: dearer, rows, table_id: t.id },
    tables: [t], charts: [], included: ids.map(vName), excluded, caveats: [...standardCaveats(ctx, ctx.cmp, p, used), `Only ${lines.length} of ${ctx.bundle.lines.length} lines have a last-year price.`], open_item_keys: flagKeys(used, ctx.bundle),
  };
}

export function what_if(ctx: Ctx, p: CommonParams & {
  scenario: "award_cheapest_per_line" | "rank_vendors";
  conditional_discounts?: { vendor: string; apply: boolean }[];
  price_changes?: { vendor: string; pct: number; line_nos?: number[]; categories?: string[] }[];
}): ToolResult {
  const force: Record<string, boolean> = {};
  const desc: string[] = [];
  // Discounts only change landed cost, so discount scenarios are evaluated on landed.
  if (p.conditional_discounts?.length && (p.basis ?? "unit_price") !== "landed") { p = { ...p, basis: "landed" }; desc.push("basis switched to landed cost (discounts only affect landed)"); }
  for (const d of p.conditional_discounts ?? []) { const v = vendorByName(ctx, d.vendor); if (v) { force[v.id] = d.apply; desc.push(`${v.name}'s conditional discount ${d.apply ? "applied" : "not applied"}`); } }
  let bundle = ctx.bundle;
  if (p.price_changes?.length) {
    // Scale the vendor's quoted prices on matching lines (a hypothetical renegotiation).
    const ql = bundle.quoteLines.map((q) => ({ ...q }));
    for (const ch of p.price_changes) {
      const v = vendorByName(ctx, ch.vendor); if (!v) continue;
      const respIds = bundle.responses.filter((r) => r.vendor_id === v.id).map((r) => r.id);
      const lineOk = (n: number | null) => {
        const l = bundle.lines.find((x) => x.line_no === n);
        return !!l && (!ch.line_nos?.length || ch.line_nos.includes(l.line_no)) && (!ch.categories?.length || ch.categories.some((c) => (l.category ?? "").toLowerCase().includes(c.toLowerCase())));
      };
      for (const q of ql) if (respIds.includes(q.response_id) && q.price_value != null && lineOk(q.line_no)) q.price_value = q.price_value * (1 + ch.pct / 100);
      desc.push(`${v.name} prices ${ch.pct > 0 ? "+" : ""}${ch.pct}%${ch.categories?.length ? ` on ${ch.categories.join(", ")}` : ""}${ch.line_nos?.length ? ` on lines ${compactList(ch.line_nos)}` : ""}`);
    }
    bundle = { ...bundle, quoteLines: ql };
  }
  // Current status of each named vendor's conditional discounts (before the scenario).
  const discountNow = (p.conditional_discounts ?? []).map((d) => {
    const v = vendorByName(ctx, d.vendor);
    const s = v ? ctx.cmp.vendors.find((x) => x.vendor_id === v.id) : undefined;
    return { vendor: v?.name ?? d.vendor, conditional_discounts: s?.discounts.filter((x) => x.condition).map((x) => `${x.text} [currently ${x.status === "pending" ? "NOT applied (not confirmed by buyer)" : x.status}]`) ?? [] };
  });
  const afterCmp = normalize(bundle, { forceConditionalDiscounts: force });
  const beforeRes = p.scenario === "rank_vendors" ? rank_vendors(ctx, p) : award_cheapest_per_line(ctx, p);
  const altCtx: Ctx = { ...ctx, bundle, cmp: afterCmp };
  const afterRes = p.scenario === "rank_vendors" ? rank_vendors(altCtx, p) : award_cheapest_per_line(altCtx, p);
  const b = beforeRes.data as Record<string, unknown>, a = afterRes.data as Record<string, unknown>;
  let diff: Record<string, unknown> = {};
  let changedRows: Record<string, string | number | null>[] = [];
  if (p.scenario === "award_cheapest_per_line") {
    const bt = beforeRes.tables[0].rows, at = afterRes.tables[0].rows;
    changedRows = at.filter((r, i) => r.winner !== bt[i].winner || r.price_inr !== bt[i].price_inr).map((r) => {
      const o = bt.find((x) => x.line === r.line)!;
      return { line: r.line, item: r.item, before_vendor: o.winner, before_inr: o.price_inr, after_vendor: r.winner, after_inr: r.price_inr };
    });
    diff = { total_before_inr: b.total_inr, total_after_inr: a.total_inr, change_inr: (a.total_inr as number) - (b.total_inr as number), lines_changed: changedRows.length, split_before: b.split, split_after: a.split };
  } else {
    diff = { ranking_before: b.ranking, ranking_after: a.ranking };
  }
  // If the scenario equals today's state (e.g. "if the discount doesn't apply"
  // while it is not applied yet), also show the opposite so the effect is visible.
  let opposite: Record<string, unknown> | null = null;
  if (p.scenario === "award_cheapest_per_line" && Object.keys(force).length && (diff.change_inr as number) === 0 && !p.price_changes?.length) {
    const flipped = Object.fromEntries(Object.entries(force).map(([k, v]) => [k, !v]));
    const oppRes = award_cheapest_per_line({ ...ctx, bundle, cmp: normalize(bundle, { forceConditionalDiscounts: flipped }) }, p);
    const od = oppRes.data as Record<string, unknown>;
    const bt = beforeRes.tables[0].rows, ot = oppRes.tables[0].rows;
    changedRows = ot.filter((r, i) => r.winner !== bt[i].winner || r.price_inr !== bt[i].price_inr).map((r) => {
      const o = bt.find((x) => x.line === r.line)!;
      return { line: r.line, item: r.item, before_vendor: o.winner, before_inr: o.price_inr, after_vendor: r.winner, after_inr: r.price_inr };
    });
    opposite = { note: "Requested scenario equals the current state. Opposite scenario shown: " + Object.entries(flipped).map(([k, v]) => `${ctx.bundle.vendors.find((x) => x.id === k)?.name} discount ${v ? "applied" : "not applied"}`).join("; "), total_current_inr: b.total_inr, total_opposite_inr: od.total_inr, change_inr: (od.total_inr as number) - (b.total_inr as number), lines_changed: changedRows.length, split_opposite: od.split };
    desc.push("(no change vs today; table shows the effect of the opposite)");
  }
  const t = table(ctx, {
    title: `What-if: ${desc.join("; ") || "no change"}`,
    columns: [{ key: "line", label: "Line", format: "int" }, { key: "item", label: "Item" }, { key: "before_vendor", label: "Before" }, { key: "before_inr", label: "₹ before", format: "inr" }, { key: "after_vendor", label: "After" }, { key: "after_inr", label: "₹ after", format: "inr" }],
    rows: changedRows,
    note: p.scenario === "award_cheapest_per_line" ? `Total ${fmtInr(b.total_inr as number)} → ${fmtInr(a.total_inr as number)}` : undefined,
  });
  return {
    summary: `What-if (${desc.join("; ")}) on ${p.scenario}`,
    data: { scenario: p.scenario, changes: desc, discount_status_now: discountNow, ...diff, opposite_scenario: opposite, table_ids: [t.id, ...afterRes.tables.map((x) => x.id)] },
    tables: p.scenario === "award_cheapest_per_line" ? [t, ...afterRes.tables.slice(1)] : [beforeRes.tables[0], afterRes.tables[0]],
    charts: [], included: afterRes.included, excluded: afterRes.excluded, caveats: [...afterRes.caveats, "Hypothetical scenario: underlying quotes are unchanged."], open_item_keys: afterRes.open_item_keys,
  };
}

export function query_rows(ctx: Ctx, p: CommonParams & { states?: string[]; group_by?: "vendor" | "category" | "line"; metric?: "sum_annual_value" | "avg_price" | "min_price" | "max_price" | "count"; sort?: "asc" | "desc"; limit?: number }): ToolResult {
  const basis = p.basis ?? "unit_price";
  const { ids, excluded } = resolveVendors(ctx, ctx.cmp, p.vendor_filter, false);
  const lines = scopeLines(ctx, p);
  const vName = (id: string) => ctx.bundle.vendors.find((v) => v.id === id)!.name;
  const rowsAll = ctx.cmp.cells
    .filter((c) => ids.includes(c.vendor_id) && lines.some((l) => l.id === c.line_id) && (!p.states?.length || p.states.includes(c.state)))
    .map((c) => {
      const l = lines.find((x) => x.id === c.line_id)!;
      const pr = eligible(c, { ...p, include_deviations: p.include_deviations ?? p.states?.includes("deviation") }).ok ? priceOf(c, basis) : null;
      return { vendor: vName(c.vendor_id), line: l.line_no, item: l.description.split(",")[0], category: l.category ?? "", state: c.state, price_inr: pr != null ? r2(pr) : null, annual_value_inr: pr != null ? r0(pr * Number(l.annual_qty)) : null };
    });
  const metric = p.metric ?? "count";
  let rows: Record<string, string | number | null>[];
  if (p.group_by) {
    const g = new Map<string, typeof rowsAll>();
    for (const r of rowsAll) { const k = String(r[p.group_by]); g.set(k, [...(g.get(k) ?? []), r]); }
    rows = [...g.entries()].map(([k, rs]) => {
      const priced = rs.filter((r) => r.price_inr != null);
      const val = metric === "count" ? rs.length : metric === "sum_annual_value" ? r0(priced.reduce((s, r) => s + r.annual_value_inr!, 0)) : !priced.length ? null
        : metric === "avg_price" ? r2(priced.reduce((s, r) => s + r.price_inr!, 0) / priced.length) : metric === "min_price" ? Math.min(...priced.map((r) => r.price_inr!)) : Math.max(...priced.map((r) => r.price_inr!));
      return { [p.group_by!]: k, [metric]: val, rows: rs.length, priced: priced.length };
    });
  } else rows = rowsAll;
  const sortKey = p.group_by ? metric : "price_inr";
  if (p.sort) {
    const dir = p.sort === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const x = a[sortKey] as number | null, y = b[sortKey] as number | null;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x - y) * dir;
    });
  }
  if (p.limit) rows = rows.slice(0, p.limit);
  const cols = rows.length ? Object.keys(rows[0]).map((k) => ({ key: k, label: k.replace(/_/g, " "), format: (k.includes("inr") || k.includes("price") || k === "sum_annual_value" ? (k.includes("annual") ? "inr_short" : "inr") : typeof rows[0][k] === "number" ? "num" : "text") as AnswerTable["columns"][number]["format"] })) : [];
  const t = table(ctx, { title: `Query${p.group_by ? ` by ${p.group_by}` : ""}`, columns: cols, rows });
  return {
    summary: `Query over ${rowsAll.length} cells${p.group_by ? ` grouped by ${p.group_by} (${metric})` : ""}`,
    data: { rows: rows.slice(0, 200), table_id: t.id }, tables: [t], charts: [], included: ids.map(vName), excluded, caveats: standardCaveats(ctx, ctx.cmp, p, []), open_item_keys: [],
  };
}

export function make_chart(ctx: Ctx, p: { table_id: string; type?: "bar" | "stacked_bar" | "line"; x: string; y: string[]; title?: string }): ToolResult {
  const t = ctx.tables.get(p.table_id);
  if (!t) return err(`Unknown table_id ${p.table_id}. Available: ${[...ctx.tables.keys()].join(", ")}`);
  const cols = t.columns.map((c) => c.key);
  const bad = [p.x, ...p.y].filter((k) => !cols.includes(k));
  if (bad.length) return err(`Columns not in ${p.table_id}: ${bad.join(", ")}. Columns: ${cols.join(", ")}`);
  const chart: AnswerChart = {
    id: `C${t.id}`, title: p.title ?? t.title, type: p.type ?? "bar", table_id: t.id, x: p.x,
    series: p.y.map((k) => ({ key: k, label: t.columns.find((c) => c.key === k)!.label })),
    data: t.rows.map((r) => Object.fromEntries([p.x, ...p.y].map((k) => [k, typeof r[k] === "number" || r[k] == null ? r[k] : r[k]]))),
  };
  return { summary: `Chart of ${t.title}`, data: { chart_id: chart.id }, tables: [], charts: [chart], included: [], excluded: [], caveats: [], open_item_keys: [] };
}

export function make_table(ctx: Ctx, p: { table_id: string; title?: string; columns?: string[] }): ToolResult {
  const t = ctx.tables.get(p.table_id);
  if (!t) return err(`Unknown table_id ${p.table_id}.`);
  const nt = table(ctx, { title: p.title ?? t.title, columns: p.columns?.length ? t.columns.filter((c) => p.columns!.includes(c.key)) : t.columns, rows: t.rows, note: t.note });
  return { summary: `Table: ${nt.title}`, data: { table_id: nt.id }, tables: [nt], charts: [], included: [], excluded: [], caveats: [], open_item_keys: [] };
}

function err(message: string): ToolResult {
  return { summary: `Error: ${message}`, data: { error: message }, tables: [], charts: [], included: [], excluded: [], caveats: [], open_item_keys: [] };
}

// ---------- tool schemas for the model ----------
const vendorFilterSchema = {
  type: "object",
  description: "Which vendors to consider. must_pass: 'all_mandatory' or a list of questionnaire codes (e.g. ['iso9001','inhouse_testing']).",
  properties: {
    vendors: { type: "array", items: { type: "string" } },
    exclude: { type: "array", items: { type: "string" } },
    must_pass: { anyOf: [{ type: "string", enum: ["all_mandatory"] }, { type: "array", items: { type: "string" } }] },
  },
};
const common = {
  basis: { type: "string", enum: ["unit_price", "landed"], description: "unit_price = quoted price per RFx unit; landed = incl. freight and confirmed discounts" },
  include_deviations: { type: "boolean", description: "Include offers whose spec differs from the RFx (default false)" },
  include_unconfirmed: { type: "boolean", description: "Include assumed/unconfirmed values (default true; always reported)" },
  vendor_filter: vendorFilterSchema,
  categories: { type: "array", items: { type: "string" }, description: "Line categories, e.g. '3-ply RSC', '5-ply RSC', '7-ply heavy duty', 'Die-cut mailer', 'Printed box', 'Sheets & pads', 'Partitions', 'Edge protectors'" },
  line_nos: { type: "array", items: { type: "integer" } },
};
const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required } },
});

export const TOOL_SCHEMAS = [
  fn("get_rfx_overview", "Status of the RFx: vendors, reply status, coverage, totals, mandatory compliance, open items."),
  fn("get_comparison", "Normalized price grid (₹ per RFx unit) with cell states for chosen lines/vendors.", common),
  fn("get_vendor_profile", "One vendor's terms, freight, discounts, questionnaire results, certificates, assumptions and open items.", { vendor: { type: "string" } }, ["vendor"]),
  fn("list_open_items", "Open ⚠ items (missing facts, unanswered questions, expired certificates, interpretations to confirm).", { vendor: { type: "string" }, kind: { type: "string" } }),
  fn("rank_vendors", "Annual total per vendor with coverage, plus a like-for-like total over lines all listed vendors priced.", common),
  fn("award_cheapest_per_line", "Award each line to the cheapest eligible vendor. Returns total, split by vendor, savings vs the best single vendor and vs last year.", common),
  fn("award_split", "Best split award under constraints (max vendors, share limits, locked lines).", {
    ...common,
    max_vendors: { type: "integer" }, max_share_pct: { type: "number" }, min_share_pct: { type: "number" },
    lock_lines: { type: "array", items: { type: "object", properties: { line: { type: "integer" }, vendor: { type: "string" } }, required: ["line", "vendor"] } },
  }),
  fn("compare_to_last_year", "Line-by-line new prices vs last-year contract prices.", common),
  fn("what_if", "Before/after for a hypothetical change: apply or remove a vendor's conditional discount, or change a vendor's prices by a percentage.", {
    ...common,
    scenario: { type: "string", enum: ["award_cheapest_per_line", "rank_vendors"] },
    conditional_discounts: { type: "array", items: { type: "object", properties: { vendor: { type: "string" }, apply: { type: "boolean" } }, required: ["vendor", "apply"] } },
    price_changes: { type: "array", items: { type: "object", properties: { vendor: { type: "string" }, pct: { type: "number" }, line_nos: { type: "array", items: { type: "integer" } }, categories: { type: "array", items: { type: "string" } } }, required: ["vendor", "pct"] } },
  }, ["scenario"]),
  fn("query_rows", "Generic filter/group/aggregate over comparison cells for questions other tools don't cover.", {
    ...common,
    states: { type: "array", items: { type: "string", enum: ["confirmed", "extracted", "converted", "needs_input", "assumed", "deviation", "not_quoted"] } },
    group_by: { type: "string", enum: ["vendor", "category", "line"] },
    metric: { type: "string", enum: ["sum_annual_value", "avg_price", "min_price", "max_price", "count"] },
    sort: { type: "string", enum: ["asc", "desc"] }, limit: { type: "integer" },
  }),
  fn("make_chart", "Chart built from a table returned by another tool (use its table_id and column keys).", {
    table_id: { type: "string" }, type: { type: "string", enum: ["bar", "stacked_bar", "line"] }, x: { type: "string" }, y: { type: "array", items: { type: "string" } }, title: { type: "string" },
  }, ["table_id", "x", "y"]),
  fn("make_table", "Show a table returned by another tool, optionally with a subset of columns and a new title.", { table_id: { type: "string" }, title: { type: "string" }, columns: { type: "array", items: { type: "string" } } }, ["table_id"]),
];

export function runTool(ctx: Ctx, name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case "get_rfx_overview": return get_rfx_overview(ctx);
    case "get_comparison": return get_comparison(ctx, args as CommonParams);
    case "get_vendor_profile": return get_vendor_profile(ctx, args as { vendor: string });
    case "list_open_items": return list_open_items(ctx, args as { vendor?: string; kind?: string });
    case "rank_vendors": return rank_vendors(ctx, args as CommonParams);
    case "award_cheapest_per_line": return award_cheapest_per_line(ctx, args as CommonParams);
    case "award_split": return award_split(ctx, args as Parameters<typeof award_split>[1]);
    case "compare_to_last_year": return compare_to_last_year(ctx, args as CommonParams);
    case "what_if": return what_if(ctx, { scenario: "award_cheapest_per_line", ...args } as Parameters<typeof what_if>[1]);
    case "query_rows": return query_rows(ctx, args as Parameters<typeof query_rows>[1]);
    case "make_chart": return make_chart(ctx, args as Parameters<typeof make_chart>[1]);
    case "make_table": return make_table(ctx, args as Parameters<typeof make_table>[1]);
    default: return err(`Unknown tool ${name}`);
  }
}
