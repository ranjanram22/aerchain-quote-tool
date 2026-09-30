// Compares the pipeline's normalized output with the generator ground truth.
// Test-only: ground truth is never used by the app.
import { createClient } from "@supabase/supabase-js";
import { loadComparison } from "../lib/rfx-data";
import { LINES, VENDORS, LAST_YEAR } from "./data";
import * as Q from "./quotes";

const fx = 88.4;
function expected(k: string, n: number): number | null | "needs_input" {
  const l = LINES[n - 1];
  if (k === "A") return Q.usdA(n) * fx;
  if (k === "B") return l.unit === "kg" ? Q.bRate(n) : Q.bRate(n) / 100;
  if (k === "C") return Q.C_NOT_QUOTED.includes(n) ? null : Q.C_BOX_LINES.includes(n) ? Q.cRate(n) / 50 : n === Q.C_BUNDLE_LINE ? "needs_input" : Q.cRate(n);
  if (k === "D") { if (n in Q.D_PER_KG_BOX_WEIGHTS) { const w = (Q.D_PER_KG_BOX_WEIGHTS as Record<number, number | null>)[n]; return w ? Q.dRate(n) * w : "needs_input"; } return Q.dRate(n); }
  if (k === "E") { if (n <= 8) return 38 * l.approx_weight_kg!; if (n <= 16) return 42 * l.approx_weight_kg!; const ly = LAST_YEAR.find((x) => x.vendor === "E" && x.line_no === n); return ly ? ly.price_inr : "needs_input"; }
  return null;
}
async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rfx } = await db.from("rfxs").select("id").order("created_at").limit(1).single();
  const { cmp } = await loadComparison(rfx!.id);
  const { data: vendors } = await db.from("vendors").select("id,name");
  for (const v of VENDORS) {
    const id = vendors!.find((x) => x.name === v.name)!.id;
    const s = cmp.vendors.find((x) => x.vendor_id === id)!;
    let ok = 0; const bad: string[] = [];
    for (const l of LINES) {
      const c = cmp.cells.find((x) => x.vendor_id === id && x.line_no === l.line_no)!;
      const e = expected(v.key, l.line_no);
      const got = c.state === "needs_input" ? "needs_input" : c.unit_inr;
      const match = e === got || (typeof e === "number" && typeof got === "number" && Math.abs(e - got) / e < 0.005);
      if (match) ok++; else bad.push(`L${l.line_no}: expected ${typeof e === "number" ? e.toFixed(2) : e} got ${typeof got === "number" ? got.toFixed(2) : got} [${c.state}${c.flags.length ? " " + c.flags.join(",") : ""}]`);
    }
    const states: Record<string, number> = {};
    cmp.cells.filter((c) => c.vendor_id === id).forEach((c) => (states[c.state] = (states[c.state] ?? 0) + 1));
    console.log(`\n== ${v.key} ${v.name}: ${ok}/30 match. coverage ${s.coverage_label}; unit total ₹${(s.total_unit_inr / 1e7).toFixed(3)} cr; landed ${s.total_landed_inr ? "₹" + (s.total_landed_inr / 1e7).toFixed(3) + " cr" : "incomplete"}; mandatory ${s.mandatory_pass ? "PASS" : "not pass"}`);
    console.log("   states", JSON.stringify(states), "| freight:", s.freight.text, "| discounts:", s.discounts.map((d) => `${d.text} [${d.status}]`).join("; "));
    if (s.mandatory_failures.length || s.mandatory_unknown.length) console.log("   mandatory:", [...s.mandatory_failures, ...s.mandatory_unknown].join(" | "));
    bad.forEach((b) => console.log("   ✗", b));
    const qs = cmp.questions.filter((q) => q.vendor_id === id).map((q) => `Q${q.q_no}:${q.status[0]}`).join(" ");
    console.log("   questions", qs);
  }
  console.log("\nOpen items:", cmp.openItems.length);
  cmp.openItems.forEach((o) => console.log(`  [${o.kind}] ${o.message.slice(0, 190)}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
