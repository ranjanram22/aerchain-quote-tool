// Sanity check of the designed demo story using generator ground truth.
// (The real check happens after Phase 2 by running the analysis tools on extracted data.)
import { LINES, LAST_YEAR } from "./data";
import * as Q from "./quotes";
const fx = Q.USD_RATE_FOR_GENERATION;
const V = ["A", "B", "C", "D"] as const;
const price: Record<string, Record<number, number | null>> = { A: {}, B: {}, C: {}, D: {}, E: {} };
for (const l of LINES) {
  const n = l.line_no;
  price.A[n] = Q.usdA(n) * fx;
  price.B[n] = l.unit === "kg" ? Q.bRate(n) : Q.bRate(n) / 100;
  price.C[n] = Q.C_NOT_QUOTED.includes(n) ? null : Q.C_BOX_LINES.includes(n) ? Q.cRate(n) / 50 : n === Q.C_BUNDLE_LINE ? null : Q.cRate(n);
  const w = (Q.D_PER_KG_BOX_WEIGHTS as Record<number, number | null>)[n];
  price.D[n] = n in Q.D_PER_KG_BOX_WEIGHTS ? (w ? Q.dRate(n) * w : null) : Q.dRate(n);
  const ly = LAST_YEAR.find((x) => x.vendor === "E" && x.line_no === n);
  price.E[n] = n <= 8 ? 38 * l.approx_weight_kg! : n <= 16 ? 42 * l.approx_weight_kg! : ly ? ly.price_inr : null;
}
const annualA = LINES.reduce((s, l) => s + price.A[l.line_no]! * l.annual_qty, 0);
const freightA = Q.A_FREIGHT_USD_PER_SHIPMENT * Q.A_SHIPMENTS_PER_MONTH * 12 * fx;
const upliftA = freightA / annualA;
console.log(`A annual INR ${(annualA / 1e7).toFixed(2)} cr, freight ${(freightA / 1e5).toFixed(1)} L = ${(upliftA * 100).toFixed(1)}%`);
const tot = (v: string) => LINES.reduce((s, l) => s + (price[v][l.line_no] ?? 0) * l.annual_qty, 0);
for (const v of ["A", "B", "C", "D", "E"]) console.log(v, (tot(v) / 1e7).toFixed(3), "cr, lines", LINES.filter((l) => price[v][l.line_no] != null).length);
const winners = (landed: boolean, bDisc: boolean) => LINES.map((l) => {
  const n = l.line_no;
  let best = "", bp = Infinity;
  for (const v of V) {
    let p = price[v][n];
    if (p == null || (v === "C" && n === Q.C_DEVIATION_LINE)) continue;
    if (v === "A" && landed) p *= 1 + upliftA;
    if (v === "B" && bDisc) p *= 1 - Q.B_DISCOUNT_PCT / 100;
    if (p < bp) { bp = p; best = v; }
  }
  return best;
}).join("");
console.log("unit      ", winners(false, false));
console.log("landed    ", winners(true, false));
console.log("landed+B% ", winners(true, true));
console.log("line 11 C vs best other:", price.C[11]!.toFixed(2), Math.min(price.A[11]!, price.B[11]!, price.D[11]!).toFixed(2));
const ly = LINES.filter((l) => l.line_no >= 17 && l.line_no <= 28).map((l) => {
  const best = Math.min(...V.map((v) => price[v][l.line_no] ?? Infinity));
  return `${l.line_no}:${price.E[l.line_no]! < best ? "cheaper" : "pricier"}`;
});
console.log("E last-year vs best new:", ly.join(" "));
