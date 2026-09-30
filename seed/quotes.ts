// Ground truth used ONLY by the seed file generators (seed/generate/*) to
// write realistic vendor documents. Nothing here is inserted into the
// database: extracted values must come from running the pipeline on the files.

import { LINES, type SeedLine } from "./data";

export const USD_RATE_FOR_GENERATION = 88.4;

type Mult = Record<number, number>;
const range = (a: number, b: number, m: number): Mult =>
  Object.fromEntries(Array.from({ length: b - a + 1 }, (_, i) => [a + i, m]));

export const MULT: Record<"A" | "B" | "C" | "D", Mult> = {
  A: { ...range(1, 8, 1.04), ...range(9, 16, 0.985), ...range(17, 19, 0.93), ...range(20, 22, 1.02), ...range(23, 25, 0.95), ...range(26, 27, 1.02), ...range(28, 29, 1.05), 30: 1.0 },
  B: { ...range(1, 16, 1.0), ...range(17, 19, 1.05), ...range(20, 22, 1.04), ...range(23, 25, 1.03), ...range(26, 27, 1.04), ...range(28, 29, 1.0), 30: 0.98 },
  C: { ...range(1, 8, 1.02), 2: 0.99, 5: 0.99, 7: 0.99, ...range(9, 16, 1.02), 11: 0.93, 19: 1.04, ...range(20, 22, 0.97), ...range(23, 25, 1.0), ...range(26, 27, 1.01), 28: 0.98, 29: 0.98 },
  D: { ...range(1, 16, 1.03), 17: 0.99, 18: 0.97, 19: 0.99, ...range(20, 22, 1.0), ...range(23, 25, 0.985), ...range(26, 27, 0.96), ...range(28, 29, 1.03), 30: 1.02 },
};

export const line = (n: number): SeedLine => LINES.find((l) => l.line_no === n)!;
export const inr = (n: number, v: "A" | "B" | "C" | "D") => line(n).fair * MULT[v][n];
export const r2 = (x: number) => Math.round(x * 100) / 100;

// Vendor A: USD, freight per shipment
export const A_FREIGHT_USD_PER_SHIPMENT = 850;
export const A_SHIPMENTS_PER_MONTH = 4;
export const usdA = (n: number) => Math.round((inr(n, "A") / USD_RATE_FOR_GENERATION) * 1000) / 1000;

// Vendor B: per 100 pcs/sets (per kg for sheets), 2.5% conditional discount, freight included
export const B_DISCOUNT_PCT = 2.5;
export const B_DISCOUNT_DAYS = 15;
export const bRate = (n: number) => (line(n).unit === "kg" ? r2(inr(n, "B")) : Math.round(inr(n, "B") * 100));

// Vendor C: 27/30 lines; deviation on 11; per box of 50 on 20, 21; per bundle (no count) on 29
export const C_NOT_QUOTED = [17, 18, 30];
export const C_DEVIATION_LINE = 11;
export const C_BOX_OF = 50;
export const C_BOX_LINES = [20, 21];
export const C_BUNDLE_LINE = 29;
export const C_BUNDLE_HIDDEN_COUNT = 100; // never written in the file
export const cRate = (n: number) => {
  if (C_BOX_LINES.includes(n)) return Math.round(inr(n, "C") * C_BOX_OF);
  if (n === C_BUNDLE_LINE) return Math.round(inr(n, "C") * C_BUNDLE_HIDDEN_COUNT);
  return r2(inr(n, "C"));
};

// Vendor D: rate card, per kg for sheets and 7-ply boxes; weight stated for 17 and 19 only
export const D_PER_KG_BOX_WEIGHTS: Record<number, number | null> = { 17: 2.45, 18: null, 19: 1.95 };
const D_HIDDEN_WEIGHT_18 = 3.4;
export const dRate = (n: number) => {
  if (n in D_PER_KG_BOX_WEIGHTS) {
    const w = D_PER_KG_BOX_WEIGHTS[n] ?? D_HIDDEN_WEIGHT_18;
    return Math.round((inr(n, "D") / w) * 2) / 2; // Rs per kg, to 50 paise
  }
  return line(n).unit === "kg" ? Math.round(inr(n, "D") * 2) / 2 : r2(inr(n, "D"));
};
export const dUnit = (n: number) => (n in D_PER_KG_BOX_WEIGHTS || line(n).unit === "kg" ? "per kg" : line(n).unit === "set" ? "per set" : "per pc");
