// Field-by-field comparison of the current (Gemini) extractions against the
// stored Sonnet baseline, plus accuracy against the generator ground truth.
// Run: npx tsx --conditions=react-server --env-file=.env.local seed/eval/compare.ts
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadComparison } from "../../lib/rfx-data";
import { VENDORS, LINES } from "../data";
import { expected } from "../verify";
import type { ExtractionT } from "../../lib/extract/schema";

type LQ = ExtractionT["line_quotes"][number];
const near = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.011) : (a ?? null) === (b ?? null));
const cur = (c: string | null) => (c ?? "INR").toUpperCase().replace(/^RS\.?$|^₹$/, "INR");
const SONNET_GT: Record<string, number> = { A: 30, B: 30, C: 30, D: 30, E: 26 };

async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rfx } = await db.from("rfxs").select("id").eq("title", "Corrugated Packaging — Chakan Plant FY27 Annual Contract").single();
  const { bundle, cmp } = await loadComparison(rfx!.id);
  const out: string[] = [];
  const summary: string[] = ["| Vendor | Input | Gemini model | Line fields agreeing with Sonnet | Commercial / questionnaire / cert fields agreeing | Ground truth (Sonnet → Gemini) | Verdict |", "|---|---|---|---|---|---|---|"];
  const inputs: Record<string, string> = { A: "xlsx, USD", B: "letterhead PDF, per 100", C: "docx paragraphs", D: "angled phone photo", E: "one-line email + expired ISO" };

  for (const v of VENDORS) {
    const vendor = bundle.vendors.find((x) => x.name === v.name)!;
    const resp = bundle.responses.find((r) => r.vendor_id === vendor.id)!;
    const { data: ext } = await db.from("extractions").select("model,raw_json,overall_confidence").eq("response_id", resp.id).order("created_at", { ascending: false }).limit(1).single();
    const g = ext!.raw_json as ExtractionT;
    const base = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline-sonnet", `${v.name.split(" ")[0].toLowerCase()}.json`), "utf8"));
    const s = base.extraction as ExtractionT;
    const byLine = (x: ExtractionT) => { const m = new Map<number, LQ>(); for (const q of x.line_quotes) if (q.rfx_line_no != null && !m.has(q.rfx_line_no)) m.set(q.rfx_line_no, q); return m; };
    const G = byLine(g), S = byLine(s);
    let agree = 0, total = 0;
    const diffs: string[] = [];
    for (const l of LINES) {
      const a = S.get(l.line_no), b = G.get(l.line_no);
      const fields: [string, unknown, unknown][] = [
        ["quoted", !!a, !!b],
        ...(a && b ? ([
          ["price", a.price_value, b.price_value], ["currency", cur(a.currency), cur(b.currency)], ["basis", a.price_basis, b.price_basis],
          ["basis_count", a.basis_count, b.basis_count], ["pieces_per_pack", a.pieces_per_pack, b.pieces_per_pack], ["weight_kg", a.weight_per_piece_kg, b.weight_per_piece_kg],
          ["deviation", a.deviation.length > 0, b.deviation.length > 0],
        ] as [string, unknown, unknown][]) : []),
      ];
      for (const [f, x, y] of fields) { total++; if (near(x, y)) agree++; else diffs.push(`L${l.line_no} ${f}: Sonnet ${JSON.stringify(x)} vs Gemini ${JSON.stringify(y)}`); }
    }
    // commercial / questionnaire / certs / references
    let cAgree = 0, cTotal = 0;
    const cmpF = (label: string, x: unknown, y: unknown) => { cTotal++; if (near(x, y)) cAgree++; else diffs.push(`${label}: Sonnet ${JSON.stringify(x)} vs Gemini ${JSON.stringify(y)}`); };
    cmpF("freight.basis", s.commercial_terms.freight.basis, g.commercial_terms.freight.basis);
    cmpF("freight.amount", s.commercial_terms.freight.amount, g.commercial_terms.freight.amount);
    cmpF("freight.shipments_per_year", s.commercial_terms.freight.shipments_per_year, g.commercial_terms.freight.shipments_per_year);
    cmpF("discounts.count", s.commercial_terms.discounts.length, g.commercial_terms.discounts.length);
    cmpF("discount.value", s.commercial_terms.discounts[0]?.value ?? null, g.commercial_terms.discounts[0]?.value ?? null);
    cmpF("discount.conditional", !!s.commercial_terms.discounts[0]?.condition, !!g.commercial_terms.discounts[0]?.condition);
    for (let q = 1; q <= 12; q++) {
      const a = s.questionnaire_answers.find((x) => x.q_no === q), b = g.questionnaire_answers.find((x) => x.q_no === q);
      cmpF(`Q${q}.answered`, !!a, !!b);
      if (a && b) { cmpF(`Q${q}.bool`, a.value_bool, b.value_bool); cmpF(`Q${q}.number`, a.value_number, b.value_number); }
    }
    const certs = (x: ExtractionT) => x.attachments.filter((a) => a.certificate).map((a) => `${a.certificate!.fact_type.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 7)}:${a.certificate!.valid_until}`).sort().join(",");
    cmpF("certificates", certs(s), certs(g));
    const refs = (x: ExtractionT) => x.references.map((r) => `${r.kind}:${[...r.applies_to_line_nos].sort((m, n) => m - n).join("-")}`).sort().join("|");
    cmpF("references", refs(s), refs(g));
    // ground truth on normalized values
    let gt = 0; const gtBad: string[] = [];
    for (const l of LINES) {
      const c = cmp.cells.find((x) => x.vendor_id === vendor.id && x.line_no === l.line_no)!;
      const e = expected(v.key, l.line_no), got = c.state === "needs_input" ? "needs_input" : c.unit_inr;
      if (e === got || (typeof e === "number" && typeof got === "number" && Math.abs(e - got) / e < 0.005)) gt++; else gtBad.push(`L${l.line_no} expected ${typeof e === "number" ? e.toFixed(2) : e} got ${typeof got === "number" ? got.toFixed(2) : got} [${c.state}]`);
    }
    const worse = gt < SONNET_GT[v.key];
    summary.push(`| ${v.key} ${v.name} | ${inputs[v.key]} | ${ext!.model} (conf ${ext!.overall_confidence}) | ${agree}/${total} | ${cAgree}/${cTotal} | ${SONNET_GT[v.key]}/30 → ${gt}/30 | ${worse ? "**Worse**" : gt > SONNET_GT[v.key] ? "Better" : "Same"} |`);
    out.push(`\n#### ${v.key} ${v.name}\nGround-truth misses (Gemini): ${gtBad.length ? gtBad.join("; ") : "none"}\n\nDifferences vs Sonnet (${diffs.length}):\n${diffs.slice(0, 40).map((d) => `- ${d}`).join("\n") || "- none"}${diffs.length > 40 ? `\n- … ${diffs.length - 40} more` : ""}`);
  }

  // Unseen samples (if their vendors exist in this RFx)
  const unseenBase = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline-sonnet", "unseen.json"), "utf8"));
  const uRows: string[] = ["| Vendor | Lines (Sonnet) | Lines matching Sonnet value/state | Differences |", "|---|---|---|---|"];
  for (const name of ["Sahyadri Corrupack", "Kolhapur Kraft Boxes", "Sai Packaging"]) {
    const vendor = bundle.vendors.find((x) => x.name === name);
    if (!vendor) { uRows.push(`| ${name} | — | not run | |`); continue; }
    const b = unseenBase[name].lines as Record<string, number | null>;
    const d: string[] = []; let ok = 0;
    const lineNos = new Set([...Object.keys(b).map(Number), ...cmp.cells.filter((c) => c.vendor_id === vendor.id && c.state !== "not_quoted").map((c) => c.line_no)]);
    for (const n of [...lineNos].sort((x, y) => x - y)) {
      const c = cmp.cells.find((x) => x.vendor_id === vendor.id && x.line_no === n)!;
      const want = n in b ? b[String(n)] : "not quoted";
      const got = c.state === "not_quoted" ? "not quoted" : c.state === "needs_input" ? null : c.unit_inr;
      if (near(want, got)) ok++; else d.push(`L${n}: Sonnet ${want === null ? "⚠ needs input" : want} vs Gemini ${got === null ? "⚠ needs input" : typeof got === "number" ? got.toFixed(2) : got}`);
    }
    const s = cmp.vendors.find((x) => x.vendor_id === vendor.id)!;
    uRows.push(`| ${name} | ${Object.keys(b).length} | ${ok}/${lineNos.size} | ${d.join("; ") || "none"}; freight: ${s.freight.text.slice(0, 80)} |`);
  }
  const report = `### Seed vendors\n\n${summary.join("\n")}\n${out.join("\n")}\n\n### Unseen samples\n\n${uRows.join("\n")}\n`;
  fs.writeFileSync(path.join(__dirname, "report.md"), report);
  console.log(report);
}
main().catch((e) => { console.error(e); process.exit(1); });
