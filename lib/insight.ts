// Recommendation strip at the top of the evaluation workspace (DECISIONS F2).
// Deterministic: built from the same tools the analysis chat uses
// (rank_vendors, award_cheapest_per_line), so every number is computed by code.
import type { Comparison } from "./normalize";
import type { RfxBundle } from "./types";
import { rank_vendors, award_cheapest_per_line, type Basis, type Ctx } from "./agent/tools";

export interface Insight { top: string | null; basis: Basis | null; note: string | null; lines: string[] }

const money = (n: number) =>
  Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr`
    : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`
      : `₹${Math.round(n).toLocaleString("en-IN")}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

interface RankRow { vendor: string; lines_priced: number; total_inr: number | null; like_for_like_inr: number | null }
interface AwardData {
  total_inr: number; lines_covered: number; lines_in_scope: number; split: { vendor: string }[];
  best_single_vendor: { vendor: string; total_inr: number; saving_vs_single_inr: number; saving_vs_single_pct: number } | null;
  vs_last_year: { change_pct: number; lines_compared: number } | null;
}

export function buildInsight(bundle: RfxBundle, cmp: Comparison): Insight {
  let tid = 0;
  const ctx: Ctx = { bundle, cmp, tables: new Map(), nextTableId: () => `I${++tid}` };
  const N = bundle.lines.length;
  const replied = cmp.vendors.filter((v) => v.replied && v.processing_status === "done");
  const waiting = cmp.vendors.filter((v) => !v.replied).map((v) => v.name);
  const openOf = (vendorId: string) => bundle.openItems.filter((i) => i.status === "open" && i.vendor_id === vendorId).length;
  const failing = replied.filter((v) => !v.mandatory_pass).map((v) => v.name);

  if (!replied.length) return { top: null, basis: null, note: null, lines: [`No vendor replies have been read yet${waiting.length ? ` (waiting on ${waiting.length})` : ""}. A recommendation appears once quotes arrive.`] };
  const compliant = replied.filter((v) => v.mandatory_pass);
  if (!compliant.length) {
    return { top: null, basis: null, note: null, lines: [
      `No vendor passes every mandatory question yet (${list(failing)}). Review the Questionnaire tab or resolve the ⚠ items before awarding.`,
      `${bundle.openItems.filter((i) => i.status === "open").length} open ⚠ item(s)${waiting.length ? `; waiting on ${list(waiting)}` : ""}.`,
    ] };
  }

  const withFreight = compliant.filter((v) => v.freight.status !== "unknown");
  const basis: Basis = withFreight.length >= 2 || withFreight.length === compliant.length ? "landed" : "unit_price";
  const pool = basis === "landed" ? withFreight : compliant;
  const filter = { vendors: pool.map((v) => v.name) };
  const basisLabel = basis === "landed" ? "landed" : "unit price";
  const note = `${basis === "landed" ? "landed cost (freight + confirmed discounts)" : "unit price (freight not known for every vendor)"} · only vendors passing every mandatory question`;
  const out: string[] = [];

  const rank = rank_vendors(ctx, { basis, vendor_filter: filter }).data as { common_lines: number[]; ranking: RankRow[] };
  const [first, second] = rank.ranking;
  const topVendor = cmp.vendors.find((v) => v.name === first?.vendor);
  if (pool.length === 1 || !second) {
    out.push(`Top bidder: ${first.vendor}, the only vendor passing every mandatory question${basis === "landed" ? " with known freight" : ""}: ${first.total_inr != null ? money(first.total_inr) : "—"}/yr ${basisLabel} for ${first.lines_priced}/${N} lines.`);
  } else if (!rank.common_lines.length || first.like_for_like_inr == null || second.like_for_like_inr == null) {
    out.push(`No like-for-like winner: the ${pool.length} eligible vendors have no lines priced in common; compare per line in the grid.`);
  } else {
    const gap = second.like_for_like_inr - first.like_for_like_inr;
    const pct = (gap / second.like_for_like_inr) * 100;
    out.push(`Top bidder: ${first.vendor}, ${money(first.like_for_like_inr)}/yr ${basisLabel}, ${pct.toFixed(1)}% below ${second.vendor} on the ${rank.common_lines.length} lines all ${pool.length} eligible vendors priced (quoted ${first.lines_priced}/${N} lines).`);
  }

  if (pool.length >= 2) {
    const a = award_cheapest_per_line(ctx, { basis, vendor_filter: filter }).data as AwardData;
    const parts = [`Cheapest-per-line split (${a.split.length} vendor${a.split.length === 1 ? "" : "s"}): ${money(a.total_inr)}/yr for ${a.lines_covered}/${a.lines_in_scope} lines`];
    if (a.best_single_vendor && a.best_single_vendor.saving_vs_single_inr > 0) parts.push(`${money(a.best_single_vendor.saving_vs_single_inr)} below ${a.best_single_vendor.vendor} alone`);
    if (a.vs_last_year) parts.push(`${a.vs_last_year.change_pct >= 0 ? "+" : ""}${a.vs_last_year.change_pct.toFixed(1)}% vs last year`);
    out.push(`${parts.join(", ")}.`);
  }

  const watch: string[] = [];
  if (topVendor) {
    const n = openOf(topVendor.vendor_id);
    const assumed = cmp.cells.filter((c) => c.vendor_id === topVendor.vendor_id && c.state === "assumed").length;
    if (n || assumed) watch.push(`${n} open ⚠${assumed ? ` and ${assumed} assumed price(s)` : ""} on ${topVendor.name}`);
  }
  if (failing.length) watch.push(`${list(failing)} excluded (mandatory)`);
  if (basis === "landed" && compliant.length > pool.length) watch.push(`${list(compliant.filter((v) => !pool.includes(v)).map((v) => v.name))} left out (freight unknown)`);
  if (waiting.length) watch.push(`no reply yet from ${list(waiting)}`);
  if (watch.length) out.push(`Before awarding: ${watch.join("; ")}.`);
  return { top: first?.vendor ?? null, basis, note, lines: out.slice(0, 3) };
}
