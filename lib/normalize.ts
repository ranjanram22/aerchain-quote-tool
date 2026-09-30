// Deterministic normalization: the single source of truth for every number on
// screen (grid, summary, analysis tools). Pure function of the RFx bundle.
// The LLM never computes anything that reaches this file's output.
import type { RfxBundle, RfxLine, QuoteLineRow, TermsRow, OpenItemRow, Question, AttachmentFactRow, Prov } from "./types";

export type CellState = "confirmed" | "extracted" | "converted" | "needs_input" | "assumed" | "deviation" | "not_quoted";

export interface CellSource {
  kind: "quote" | "last_year" | "buyer";
  quote_line_id?: string;
  response_id?: string;
  file?: string;
  locator?: string;
  snippet?: string;
  raw_value?: number | null;
  raw_currency?: string | null;
  raw_unit?: string | null;
  vendor_line_text?: string | null;
  match_reason?: string | null;
  confidence?: number | null;
  match_confidence?: number | null;
  origin?: string;
  model?: string | null;
  last_year?: { contract_ref: string | null; price_inr: number; unit: string; valid_from: string | null; valid_to: string | null; description: string | null };
  reference?: { phrase: string; provenance: Prov };
}

export interface Cell {
  line_id: string;
  line_no: number;
  vendor_id: string;
  state: CellState;
  unit_inr: number | null; // per RFx unit, INR, before discounts and freight
  net_inr: number | null; // after discounts that apply
  landed_inr: number | null; // net + freight per unit (null if freight unknown)
  landed_complete: boolean;
  steps: string[];
  landed_steps: string[];
  missing: string | null;
  flags: string[];
  open_item_keys: string[];
  deviation: { field: string; requested: string; offered: string; note: string }[] | null;
  source: CellSource | null;
}

export type QStatus = "pass" | "fail" | "unknown" | "not_answered";
export interface QuestionResult {
  question_id: string;
  q_no: number;
  code: string | null;
  text: string;
  mandatory: boolean;
  vendor_id: string;
  status: QStatus;
  answer_text: string | null;
  reason: string;
  provenance: Prov | null;
}

export interface VendorSummary {
  vendor_id: string;
  name: string;
  replied: boolean;
  response_id: string | null;
  processing_status: string | null;
  lines_priced: number; // any computable unit price (incl. deviations)
  lines_priced_compliant: number; // excluding deviations
  lines_needs_input: number;
  lines_not_quoted: number;
  coverage_label: string;
  total_unit_inr: number; // Σ unit price × qty over priced non-deviation lines
  total_landed_inr: number | null; // null when freight unknown
  landed_complete: boolean;
  freight: { status: "included" | "computed" | "unknown" | "buyer_input"; text: string; annual_inr: number | null; uplift_pct: number | null };
  discounts: { text: string; condition: string | null; status: "applied" | "pending" | "rejected"; key: string | null }[];
  mandatory_pass: boolean; // every mandatory question passes
  mandatory_failures: string[];
  mandatory_unknown: string[];
  flags: string[];
}

export interface DerivedOpenItem {
  key: string;
  kind: string;
  vendor_id: string;
  response_id: string | null;
  rfx_line_id: string | null;
  quote_line_id: string | null;
  message: string;
  details: Record<string, unknown>;
}

export interface Comparison {
  cells: Cell[];
  vendors: VendorSummary[];
  questions: QuestionResult[];
  openItems: DerivedOpenItem[];
  fxUsed: Record<string, { rate: number; as_of: string }>;
}

export interface NormalizeOptions {
  // What-if switches; defaults reflect the buyer's confirmed state.
  forceConditionalDiscounts?: Record<string, boolean>; // vendor_id → apply all its conditional discounts
}

const fmt = (n: number, d = 2) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const inr = (n: number) => `₹${fmt(n)}`;
const cur = (c: string | null, n: number) => (c === "INR" || !c ? inr(n) : `${c} ${fmt(n, n < 1 ? 3 : 2)}`);
const unitWord = (u: string) => (u === "kg" ? "kg" : u === "set" ? "set" : "pc");

function specWeight(line: RfxLine): number | null {
  const w = line.spec?.approx_weight_kg;
  return typeof w === "number" && w > 0 ? w : null;
}

function resolvedMap(items: OpenItemRow[]) {
  const m = new Map<string, OpenItemRow>();
  for (const i of items) if (i.key && (i.status === "resolved" || i.status === "dismissed")) m.set(i.key, i);
  return m;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function normalize(b: RfxBundle, opts: NormalizeOptions = {}): Comparison {
  const resolved = resolvedMap(b.openItems);
  const res = (key: string) => {
    const i = resolved.get(key);
    return i && i.status === "resolved" ? (i.resolution ?? {}) : null;
  };
  const dismissed = (key: string) => resolved.get(key)?.status === "dismissed";
  const fx = new Map(b.fx.map((f) => [f.currency.toUpperCase(), f]));
  const fxUsed: Comparison["fxUsed"] = {};
  const derived: DerivedOpenItem[] = [];
  const addItem = (i: DerivedOpenItem) => {
    if (!derived.some((d) => d.key === i.key)) derived.push(i);
  };
  const cells: Cell[] = [];
  const vendorName = new Map(b.vendors.map((v) => [v.id, v.name]));
  const lineByNo = new Map(b.lines.map((l) => [l.line_no, l]));
  const extractionByResp = new Map(b.extractions.map((e) => [e.response_id, e]));

  // ---------- Pass 1: unit price per RFx unit in INR ----------
  for (const v of b.vendors) {
    const resp = b.responses.find((r) => r.vendor_id === v.id) ?? null;
    const qls = resp ? b.quoteLines.filter((q) => q.response_id === resp.id) : [];
    const ext = resp ? extractionByResp.get(resp.id) : undefined;
    const vName = v.name;

    for (const line of b.lines) {
      const base: Cell = {
        line_id: line.id, line_no: line.line_no, vendor_id: v.id, state: "not_quoted", unit_inr: null, net_inr: null, landed_inr: null,
        landed_complete: false, steps: [], landed_steps: [], missing: null, flags: [], open_item_keys: [], deviation: null, source: null,
      };
      if (!resp || resp.processing_status !== "done") {
        cells.push(base);
        continue;
      }
      // Pick the best quote line for this RFx line (highest confidence, priced first).
      const cands = qls.filter((q) => q.matched_rfx_line_id === line.id);
      cands.sort((a, c) => Number(c.price_value != null) - Number(a.price_value != null) || (c.confidence ?? 0) - (a.confidence ?? 0));
      const q = cands[0];
      if (cands.length > 1) base.flags.push("multiple_quotes");

      if (q && q.price_value != null) {
        cells.push(convertQuote(base, q, line, vName, ext?.model ?? null));
        continue;
      }
      // Reference phrases ("same as last year")
      const ref = ext?.references.find((r) => r.applies_to_line_nos.includes(line.line_no));
      if (ref) {
        cells.push(resolveReference(base, ref, line, v.id, vName, resp.id));
        continue;
      }
      cells.push(base);
    }

    // Whole-reply low confidence (e.g. a blurry or angled photo): keep every
    // value, but flag them all ⚠ until the buyer confirms the reading.
    if (resp && resp.processing_status === "done" && ext) {
      const poorImg = ext.image_quality.filter((q) => q.readable === "partly" || q.readable === "no");
      const low = (ext.overall_confidence ?? 1) < 0.7 || poorImg.length > 0;
      const key = `lowext:${resp.id}`;
      const r = res(key);
      if (low && !(r && r.accept === true) && !dismissed(key)) {
        const vc = cells.filter((c) => c.vendor_id === v.id && c.source?.kind === "quote" && c.unit_inr != null);
        for (const c of vc) { if (!c.flags.includes("low_confidence")) c.flags.push("low_confidence"); c.open_item_keys.push(key); }
        const why = [
          (ext.overall_confidence ?? 1) < 0.7 ? `overall reading confidence ${Math.round((ext.overall_confidence ?? 0) * 100)}%` : null,
          ...poorImg.map((q) => `${q.file} only ${q.readable} readable${q.issues.length ? ` (${q.issues.slice(0, 3).join(", ")})` : ""}`),
        ].filter(Boolean).join("; ");
        addItem({ key, kind: "confirm_interpretation", vendor_id: v.id, response_id: resp.id, rfx_line_id: null, quote_line_id: null,
          message: `${vName}'s reply was read with low confidence (${why}). All ${vc.length} extracted prices are kept but flagged — compare them with the original and confirm, or correct individual values.`,
          details: { subkind: "low_confidence_extraction", confidence: ext.overall_confidence, image_quality: ext.image_quality, line_nos: vc.map((c) => c.line_no), fingerprint: `lowext:${v.id}:${ext.overall_confidence}` } });
      }
    }

    // Missing lines → one open item per vendor
    if (resp && resp.processing_status === "done") {
      const missing = cells.filter((c) => c.vendor_id === v.id && c.state === "not_quoted").map((c) => c.line_no);
      if (missing.length) {
        const key = `missing:${resp.id}`;
        addItem({ key, kind: "missing_line", vendor_id: v.id, response_id: resp.id, rfx_line_id: null, quote_line_id: null,
          message: `${vName} did not quote ${missing.length} of ${b.lines.length} lines: ${compactList(missing)}.`, details: { line_nos: missing, fingerprint: `missing:${v.id}:${missing.join(",")}` } });
        cells.filter((c) => c.vendor_id === v.id && c.state === "not_quoted").forEach((c) => c.open_item_keys.push(key));
      }
    }
  }

  function convertQuote(cell: Cell, q: QuoteLineRow, line: RfxLine, vName: string, model: string | null): Cell {
    const u = line.unit;
    const raw = Number(q.price_value);
    const currency = (q.price_currency ?? "INR").toUpperCase();
    const buyerEdited = q.value_origin === "buyer_input";
    cell.source = {
      kind: buyerEdited ? "buyer" : "quote", quote_line_id: q.id, response_id: q.response_id, file: q.provenance?.file, locator: q.provenance?.locator,
      snippet: q.provenance?.snippet, raw_value: raw, raw_currency: currency, raw_unit: q.price_unit_as_written, vendor_line_text: q.vendor_line_text,
      match_reason: q.match_reason, confidence: q.confidence, match_confidence: q.match_confidence, origin: q.value_origin, model,
    };
    let price = raw; // in quote currency, per RFx unit after the steps below
    let converted = false;
    const basis = q.qty_basis ?? "per_unit";
    const steps = cell.steps;
    steps.push(`Quoted: ${cur(currency, raw)} ${q.price_unit_as_written ?? ""}`.trim());

    const needs = (key: string, kind: string, missing: string, message: string, extra: Record<string, unknown> = {}) => {
      cell.state = "needs_input";
      cell.missing = missing;
      cell.open_item_keys.push(key);
      addItem({ key, kind, vendor_id: cell.vendor_id, response_id: q.response_id, rfx_line_id: line.id, quote_line_id: q.id, message,
        details: { line_no: line.line_no, raw_value: raw, raw_unit: q.price_unit_as_written, currency, fingerprint: `${kind}:${cell.vendor_id}:${line.line_no}:${raw}:${q.price_unit_as_written}`, ...extra } });
    };

    // Unit basis → per RFx unit
    const toWeight = (perKgPrice: number, label: string): number | null => {
      if (u === "kg") return perKgPrice;
      const key = `wpp:${q.id}`;
      const r = res(key);
      let w: number | null = null, src = "";
      if (r && typeof r.value === "number") { w = r.value; src = "buyer input"; }
      else if (q.weight_per_piece_kg) { w = Number(q.weight_per_piece_kg); src = "stated by vendor"; }
      else if (specWeight(line)) { w = specWeight(line); src = "RFx spec (approx. weight)"; }
      if (w == null) {
        needs(key, "weight_per_piece", `Weight per ${unitWord(u)}`,
          `${vName} quoted line ${line.line_no} at ${cur(currency, raw)} ${label}. Weight per ${unitWord(u)} is not stated, so it cannot be compared with per-${unitWord(u)} quotes.`);
        return null;
      }
      steps.push(`${cur(currency, perKgPrice)}/kg × ${fmt(w, 3)} kg/${unitWord(u)} (${src}) = ${cur(currency, perKgPrice * w)}/${unitWord(u)}`);
      if (src === "buyer input") cell.flags.push("buyer_input");
      converted = true;
      return perKgPrice * w;
    };

    if (basis === "per_n") {
      const n = Number(q.basis_count);
      if (!n || n <= 0) {
        needs(`ppp:${q.id}`, "pieces_per_pack", "Quantity the price refers to", `${vName} quoted line ${line.line_no} as "${q.price_unit_as_written}" but the quantity basis is unclear.`);
      } else {
        price = raw / n;
        steps.push(`${cur(currency, raw)} per ${fmt(n, 0)} ÷ ${fmt(n, 0)} = ${cur(currency, price)}/${unitWord(u)}`);
        converted = true;
      }
    } else if (basis === "per_pack") {
      const key = `ppp:${q.id}`;
      const r = res(key);
      const n = r && typeof r.value === "number" ? r.value : q.pieces_per_pack ? Number(q.pieces_per_pack) : null;
      if (!n) {
        needs(key, "pieces_per_pack", `Pieces per ${packWord(q.price_unit_as_written)}`,
          `${vName} quoted line ${line.line_no} at ${cur(currency, raw)} ${q.price_unit_as_written}. The number of ${u === "set" ? "sets" : "pieces"} per ${packWord(q.price_unit_as_written)} is not stated. Needed to compare with per-${unitWord(u)} quotes.`);
      } else {
        price = raw / n;
        steps.push(`${cur(currency, raw)} per ${packWord(q.price_unit_as_written)} of ${fmt(n, 0)} ÷ ${fmt(n, 0)} = ${cur(currency, price)}/${unitWord(u)}${r ? " (pack size: buyer input)" : ""}`);
        if (r) cell.flags.push("buyer_input");
        converted = true;
      }
    } else if (basis === "per_kg") {
      const p = toWeight(raw, "per kg");
      if (p != null) price = p;
    } else if (basis === "per_tonne") {
      steps.push(`${cur(currency, raw)}/tonne ÷ 1000 = ${cur(currency, raw / 1000)}/kg`);
      const p = toWeight(raw / 1000, "per tonne");
      if (p != null) price = p;
      converted = true;
    } else if (basis === "per_unit" && q.basis_item === "kg" && u !== "kg") {
      const p = toWeight(raw, "per kg");
      if (p != null) price = p;
    }
    if (cell.state === "needs_input") return cell;

    // Currency → INR
    if (currency !== "INR") {
      const fxKey = `fx:${currency}`;
      const r = fx.get(currency);
      if (!r) {
        needs(fxKey, "fx_rate", `${currency}→INR exchange rate`, `No exchange rate for ${currency} in FX rates. Add it in Admin → FX rates.`);
        return cell;
      }
      fxUsed[currency] = { rate: Number(r.rate_to_inr), as_of: r.as_of };
      const p2 = price * Number(r.rate_to_inr);
      steps.push(`${cur(currency, price)} × ${fmt(Number(r.rate_to_inr), 4)} (${currency}→INR, as of ${r.as_of}) = ${inr(p2)}`);
      price = p2;
      converted = true;
    }
    cell.unit_inr = round4(price);
    if (steps.length === 1) steps.push(`= ${inr(price)}/${unitWord(u)} (no conversion needed)`);

    // Deviation
    const dev = (q.deviation ?? []).filter(Boolean);
    const devKey = `dev:${q.id}`;
    const devRes = res(devKey);
    if (dev.length && !(devRes && devRes.accept === true)) {
      cell.deviation = dev;
      cell.state = "deviation";
    } else if (buyerEdited || cell.flags.includes("buyer_input")) cell.state = "confirmed";
    else cell.state = converted ? "converted" : "extracted";
    if (devRes && devRes.accept === true) { cell.deviation = dev; cell.flags.push("deviation_accepted"); cell.state = "confirmed"; }

    // Low confidence / inferred mapping. Lines inferred from the same group
    // statement share one open item so the buyer confirms the scope once.
    const lowConf = (q.confidence ?? 1) < 0.7 || (q.match_confidence ?? 1) < 0.7;
    const grouped = q.value_origin === "inferred" && !!q.provenance?.snippet;
    const confKey = grouped ? `group:${q.response_id}:${hashStr(`${q.provenance!.snippet}|${raw}|${currency}|${basis}`)}` : `conf:${q.id}`;
    const confRes = res(confKey);
    if (q.value_origin === "inferred") cell.flags.push("inferred");
    if (lowConf && !buyerEdited) {
      if (confRes && confRes.accept === true) cell.state = cell.state === "deviation" ? "deviation" : "confirmed";
      else if (!dismissed(confKey)) {
        cell.flags.push("low_confidence");
        cell.open_item_keys.push(confKey);
        const existing = derived.find((d) => d.key === confKey);
        if (grouped && existing) {
          const nos = [...(existing.details.line_nos as number[]), line.line_no];
          existing.details.line_nos = nos;
          existing.message = `${vName} wrote "${q.provenance!.snippet}". Read as ${cur(currency, raw)} ${q.price_unit_as_written ?? ""} and applied to lines ${compactList(nos)}. Confirm this scope, or correct individual lines.`;
        } else {
          addItem({ key: confKey, kind: "confirm_interpretation", vendor_id: cell.vendor_id, response_id: q.response_id, rfx_line_id: grouped ? null : line.id, quote_line_id: grouped ? null : q.id,
            message: grouped
              ? `${vName} wrote "${q.provenance!.snippet}". Read as ${cur(currency, raw)} ${q.price_unit_as_written ?? ""} and applied to line ${line.line_no}. Confirm this scope, or correct individual lines.`
              : `Please confirm line ${line.line_no} for ${vName}: read as ${cur(currency, raw)} ${q.price_unit_as_written ?? ""}. ${q.match_reason ?? ""}`.trim(),
            details: { subkind: grouped ? "group_statement" : "low_confidence", line_no: line.line_no, line_nos: [line.line_no], confidence: q.confidence, match_confidence: q.match_confidence, snippet: q.provenance?.snippet, match_reason: q.match_reason,
              fingerprint: grouped ? `group:${cell.vendor_id}:${q.provenance!.snippet}:${raw}:${basis}` : `conf:${cell.vendor_id}:${line.line_no}:${raw}:${q.price_unit_as_written}` } });
        }
      }
    }
    if (dev.length && !(devRes && devRes.accept === true)) {
      cell.open_item_keys.push(devKey);
      addItem({ key: devKey, kind: "confirm_interpretation", vendor_id: cell.vendor_id, response_id: q.response_id, rfx_line_id: line.id, quote_line_id: q.id,
        message: `${vName} offers a different spec on line ${line.line_no}: ${dev.map((d) => `${d.field} ${d.offered} vs ${d.requested} requested`).join("; ")}. Excluded from award totals unless you accept it.`,
        details: { subkind: "deviation", line_no: line.line_no, deviation: dev, fingerprint: `dev:${cell.vendor_id}:${line.line_no}:${JSON.stringify(dev)}` } });
    }
    return cell;
  }

  function resolveReference(cell: Cell, ref: RfxBundle["extractions"][number]["references"][number], line: RfxLine, vendorId: string, vName: string, responseId: string): Cell {
    cell.source = { kind: "last_year", response_id: responseId, file: ref.provenance?.file, locator: ref.provenance?.locator, snippet: ref.provenance?.snippet, reference: { phrase: ref.phrase, provenance: ref.provenance }, confidence: ref.confidence, origin: "assumed" };
    const missKey = `refmiss:${responseId}:${line.line_no}`;
    const manual = res(missKey);
    if (manual && typeof manual.price_inr === "number") {
      cell.unit_inr = manual.price_inr;
      cell.state = "confirmed";
      cell.flags.push("buyer_input");
      cell.steps.push(`Vendor wrote "${ref.phrase}". Buyer entered ${inr(manual.price_inr)}/${unitWord(line.unit)}.`);
      return cell;
    }
    const ly = ref.kind === "same_as_last_year" ? b.lastYear.find((r) => r.vendor_id === vendorId && r.line_key === line.line_key) : undefined;
    if (!ly || ly.unit !== line.unit) {
      cell.state = "needs_input";
      cell.missing = "Price (vendor referred to an earlier price we don't have on record)";
      cell.open_item_keys.push(missKey);
      addItem({ key: missKey, kind: "confirm_interpretation", vendor_id: vendorId, response_id: responseId, rfx_line_id: line.id, quote_line_id: null,
        message: `${vName} wrote "${ref.phrase}" but there is no ${ref.kind === "same_as_last_year" ? "last-year" : "earlier"} price on record for line ${line.line_no}${ly ? ` in the RFx unit (${line.unit})` : ""}. Enter the price or ask the vendor.`,
        details: { subkind: "reference_unresolved", line_no: line.line_no, phrase: ref.phrase, fingerprint: `refmiss:${vendorId}:${line.line_no}:${ref.phrase}` } });
      return cell;
    }
    let p = Number(ly.price_inr);
    cell.source.last_year = { contract_ref: ly.contract_ref, price_inr: p, unit: ly.unit, valid_from: ly.valid_from, valid_to: ly.valid_to, description: ly.description };
    cell.steps.push(`Vendor wrote "${ref.phrase}" → last-year contract ${ly.contract_ref ?? ""}: ${inr(p)}/${unitWord(line.unit)}`);
    if (ref.adjustment_pct) {
      const p2 = p * (1 + ref.adjustment_pct / 100);
      cell.steps.push(`${inr(p)} ${ref.adjustment_pct > 0 ? "+" : "−"} ${Math.abs(ref.adjustment_pct)}% = ${inr(p2)}`);
      p = p2;
    }
    cell.unit_inr = round4(p);
    const refKey = `ref:${responseId}:${ref.phrase}`;
    const r = res(refKey);
    cell.state = r && r.accept === true ? "confirmed" : "assumed";
    if (!(r && r.accept === true) && !dismissed(refKey)) {
      cell.open_item_keys.push(refKey);
      addItem({ key: refKey, kind: "confirm_interpretation", vendor_id: vendorId, response_id: responseId, rfx_line_id: null, quote_line_id: null,
        message: `${vName} wrote "${ref.phrase}". Last year's contract prices were applied to lines ${compactList(ref.applies_to_line_nos)} where a record exists. Confirm this interpretation.`,
        details: { subkind: "reference", phrase: ref.phrase, line_nos: ref.applies_to_line_nos, fingerprint: `ref:${vendorId}:${ref.phrase}` } });
    }
    return cell;
  }

  // ---------- Sanity check: outliers vs other vendors ----------
  for (const line of b.lines) {
    const lc = cells.filter((c) => c.line_id === line.id && c.unit_inr != null);
    for (const c of lc) {
      const others = lc.filter((o) => o.vendor_id !== c.vendor_id).map((o) => o.unit_inr!);
      if (others.length < 2) continue;
      const m = median(others)!;
      const ratio = c.unit_inr! / m;
      if (ratio > 3 || ratio < 0.33) {
        const key = `outlier:${c.vendor_id}:${line.line_no}`;
        c.flags.push(ratio > 3 ? "outlier_high" : "outlier_low");
        if (!dismissed(key) && !res(key)) {
          c.open_item_keys.push(key);
          addItem({ key, kind: "price_check", vendor_id: c.vendor_id, response_id: c.source?.response_id ?? null, rfx_line_id: line.id, quote_line_id: c.source?.quote_line_id ?? null,
            message: `${vendorName.get(c.vendor_id)}'s price on line ${line.line_no} (${inr(c.unit_inr!)}) is ${fmt(ratio, 1)}× the median of other vendors (${inr(m)}). Possible unit error — please check.`,
            details: { line_no: line.line_no, ratio, median: m, fingerprint: `outlier:${c.vendor_id}:${line.line_no}:${c.unit_inr}` } });
        }
      }
    }
  }

  // ---------- Pass 2: discounts and freight → landed ----------
  const vendors: VendorSummary[] = [];
  for (const v of b.vendors) {
    const resp = b.responses.find((r) => r.vendor_id === v.id) ?? null;
    const t: TermsRow | undefined = resp ? b.terms.find((x) => x.response_id === resp.id) : undefined;
    const vc = cells.filter((c) => c.vendor_id === v.id);
    const qty = (c: Cell) => Number(lineByNo.get(c.line_no)?.annual_qty ?? 0);
    const summary: VendorSummary = {
      vendor_id: v.id, name: v.name, replied: !!resp, response_id: resp?.id ?? null, processing_status: resp?.processing_status ?? null,
      lines_priced: 0, lines_priced_compliant: 0, lines_needs_input: 0, lines_not_quoted: 0, coverage_label: "", total_unit_inr: 0, total_landed_inr: null,
      landed_complete: false, freight: { status: "unknown", text: "No response", annual_inr: null, uplift_pct: null }, discounts: [],
      mandatory_pass: false, mandatory_failures: [], mandatory_unknown: [], flags: [],
    };

    // Discounts
    for (const c of vc) c.net_inr = c.unit_inr;
    (t?.discounts ?? []).forEach((d, idx) => {
      const key = `disc:${resp!.id}:${idx}`;
      const r = res(key);
      const forced = opts.forceConditionalDiscounts?.[v.id];
      const status: "applied" | "pending" | "rejected" = !d.condition ? "applied" : forced === true ? "applied" : forced === false ? "rejected" : r ? (r.apply === true ? "applied" : "rejected") : "pending";
      const cond = d.condition?.replace(/[.\s]+$/, "") ?? null;
      const text = d.kind === "percent" ? `${d.value}% discount${cond ? ` — condition: ${cond}` : ""}` : `${d.kind.replace(/_/g, " ")} ${d.value}${cond ? ` — condition: ${cond}` : ""}`;
      summary.discounts.push({ text, condition: d.condition, status, key: d.condition ? key : null });
      if (d.condition && !r && forced === undefined) {
        addItem({ key, kind: "confirm_interpretation", vendor_id: v.id, response_id: resp!.id, rfx_line_id: null, quote_line_id: null,
          message: `${v.name} offers ${text}. Conditional discounts are not included in landed cost unless you confirm the condition will be met.`,
          details: { subkind: "conditional_discount", discount: d, snippet: d.provenance?.snippet, fingerprint: `disc:${v.id}:${d.kind}:${d.value}:${d.condition}` } });
      }
      const applies = (c: Cell) => !d.applies_to_line_nos || d.applies_to_line_nos.length === 0 || d.applies_to_line_nos.includes(c.line_no);
      for (const c of vc) {
        if (c.net_inr == null || !applies(c)) continue;
        if (status === "pending") { c.flags.push("conditional_discount"); if (d.condition) c.open_item_keys.push(key); continue; }
        if (status !== "applied") continue;
        if (d.kind === "percent") {
          const n = c.net_inr * (1 - d.value / 100);
          c.landed_steps.push(`${inr(c.net_inr)} − ${d.value}% discount${d.condition ? ` (${d.condition}; ${r || forced ? "confirmed by buyer" : ""})` : ""} = ${inr(n)}`);
          c.net_inr = round4(n);
        } else if (d.kind === "amount_per_unit") {
          const n = c.net_inr - d.value;
          c.landed_steps.push(`${inr(c.net_inr)} − ${inr(d.value)} per unit discount = ${inr(n)}`);
          c.net_inr = round4(n);
        }
      }
    });

    // Freight
    const priced = vc.filter((c) => c.net_inr != null);
    const valueBase = priced.reduce((s, c) => s + c.net_inr! * qty(c), 0);
    const f = t?.freight ?? null;
    const fKey = resp ? `freight:${resp.id}` : "";
    const fr = fKey ? res(fKey) : null;
    let perUnit: ((c: Cell) => number | null) | null = null;
    let fText = "";
    if (!resp || resp.processing_status !== "done") { fText = resp ? "Response still processing" : "No response"; }
    else if (fr && fr.mode === "included") { summary.freight.status = "buyer_input"; fText = "Included (buyer confirmed)"; perUnit = () => 0; }
    else if (fr && fr.mode === "percent" && typeof fr.value === "number") {
      summary.freight.status = "buyer_input"; fText = `${fr.value}% of value (buyer input)`; summary.freight.uplift_pct = fr.value; summary.freight.annual_inr = valueBase * fr.value / 100;
      perUnit = (c) => c.net_inr! * (fr.value as number) / 100;
    } else if (fr && fr.mode === "annual_inr" && typeof fr.value === "number" && valueBase > 0) {
      const pct = (fr.value / valueBase) * 100;
      summary.freight.status = "buyer_input"; fText = `${inr(fr.value)}/year (buyer input), allocated pro-rata to line value (${fmt(pct, 2)}%)`; summary.freight.annual_inr = fr.value; summary.freight.uplift_pct = pct;
      perUnit = (c) => c.net_inr! * pct / 100;
    } else if (f?.basis === "included") { summary.freight.status = "included"; fText = `Included — "${f.note}"`; perUnit = () => 0; }
    else if (f?.basis === "per_shipment" && f.amount != null && f.shipments_per_year) {
      const rate = toInrRate(f.currency);
      if (rate != null && valueBase > 0) {
        const annual = f.amount * f.shipments_per_year * rate;
        const pct = (annual / valueBase) * 100;
        summary.freight.status = "computed"; summary.freight.annual_inr = annual; summary.freight.uplift_pct = pct;
        fText = `${cur(f.currency, f.amount)} per shipment × ${fmt(f.shipments_per_year, 0)} shipments/yr${rate !== 1 ? ` × ${fmt(rate, 4)}` : ""} = ${inr(annual)}/yr, allocated pro-rata to line value (+${fmt(pct, 2)}%)`;
        perUnit = (c) => c.net_inr! * pct / 100;
      }
    } else if (f?.basis === "per_unit" && f.amount != null) {
      const rate = toInrRate(f.currency);
      if (rate != null) { summary.freight.status = "computed"; fText = `${cur(f.currency, f.amount)} per unit`; perUnit = () => f.amount! * rate; }
    } else if (f?.basis === "percent" && f.amount != null) {
      summary.freight.status = "computed"; summary.freight.uplift_pct = f.amount; summary.freight.annual_inr = valueBase * f.amount / 100; fText = `${f.amount}% of value`;
      perUnit = (c) => c.net_inr! * f.amount! / 100;
    } else if (f?.basis === "lump_sum" && f.amount != null && valueBase > 0) {
      const rate = toInrRate(f.currency);
      if (rate != null) {
        const annual = f.amount * rate, pct = (annual / valueBase) * 100;
        summary.freight.status = "computed"; summary.freight.annual_inr = annual; summary.freight.uplift_pct = pct;
        fText = `Lump sum ${cur(f.currency, f.amount)} allocated pro-rata (+${fmt(pct, 2)}%)`; perUnit = (c) => c.net_inr! * pct / 100;
      }
    } else if (f?.basis === "per_kg" && f.amount != null) {
      const rate = toInrRate(f.currency);
      if (rate != null) {
        summary.freight.status = "computed"; fText = `${cur(f.currency, f.amount)} per kg`;
        perUnit = (c) => {
          const line = lineByNo.get(c.line_no)!;
          if (line.unit === "kg") return f.amount! * rate;
          const w = specWeight(line);
          return w ? f.amount! * rate * w : null;
        };
      }
    }
    if (resp && resp.processing_status === "done" && !perUnit) {
      summary.freight.status = "unknown";
      fText = f ? (f.basis === "not_mentioned" ? "Freight not mentioned" : `Freight extra, amount not usable: "${f.note}"`) : "Freight not mentioned";
      if (!dismissed(fKey)) {
        addItem({ key: fKey, kind: "freight_amount", vendor_id: v.id, response_id: resp.id, rfx_line_id: null, quote_line_id: null,
          message: `${v.name}: ${fText}. Landed cost cannot be computed until freight is known (amount per year, % of value, or confirm included).`,
          details: { freight: f, fingerprint: `freight:${v.id}:${f?.basis}:${f?.amount}:${f?.note}` } });
      }
    }
    summary.freight.text = fText;
    for (const c of vc) {
      if (c.net_inr == null) continue;
      if (!perUnit) { c.flags.push("freight_unknown"); if (fKey) c.open_item_keys.push(fKey); continue; }
      const fu = perUnit(c);
      if (fu == null) { c.flags.push("freight_unknown"); continue; }
      c.landed_inr = round4(c.net_inr + fu);
      c.landed_complete = true;
      if (fu > 0) c.landed_steps.push(`${inr(c.net_inr)} + freight ${inr(fu)} = ${inr(c.landed_inr)} (${summary.freight.text})`);
      else c.landed_steps.push(`Freight included: landed ${inr(c.landed_inr)}`);
    }

    // Coverage & totals
    for (const c of vc) {
      if (c.state === "not_quoted") summary.lines_not_quoted++;
      else if (c.state === "needs_input") summary.lines_needs_input++;
      if (c.unit_inr != null) {
        summary.lines_priced++;
        if (c.state !== "deviation") {
          summary.lines_priced_compliant++;
          summary.total_unit_inr += c.unit_inr * qty(c);
        }
      }
    }
    const landedCells = vc.filter((c) => c.unit_inr != null && c.state !== "deviation");
    summary.landed_complete = landedCells.length > 0 && landedCells.every((c) => c.landed_complete);
    summary.total_landed_inr = summary.landed_complete ? landedCells.reduce((s, c) => s + c.landed_inr! * qty(c), 0) : null;
    summary.coverage_label = `${summary.lines_priced_compliant}/${b.lines.length} lines`;
    vendors.push(summary);
  }

  function toInrRate(currency: string | null): number | null {
    const c = (currency ?? "INR").toUpperCase();
    if (c === "INR") return 1;
    const r = fx.get(c);
    if (!r) return null;
    fxUsed[c] = { rate: Number(r.rate_to_inr), as_of: r.as_of };
    return Number(r.rate_to_inr);
  }

  // ---------- Questionnaire & certificates ----------
  const questions: QuestionResult[] = [];
  for (const v of b.vendors) {
    const resp = b.responses.find((r) => r.vendor_id === v.id);
    const summary = vendors.find((s) => s.vendor_id === v.id)!;
    const unanswered: number[] = [];
    const vFacts = resp ? b.attachments.filter((a) => a.response_id === resp.id) : [];
    for (const q of b.questions) {
      const r = evalQuestion(q, v.id, resp?.id ?? null, vFacts);
      questions.push(r);
      if (r.status === "not_answered") unanswered.push(q.q_no);
      if (r.mandatory && r.status === "fail") summary.mandatory_failures.push(`Q${q.q_no} ${q.code ?? ""}: ${r.reason}`);
      if (r.mandatory && (r.status === "unknown" || r.status === "not_answered")) {
        summary.mandatory_unknown.push(`Q${q.q_no} ${q.code ?? ""}: ${r.reason}`);
        const key = `qa:${resp?.id}:${q.q_no}`;
        if (resp && resp.processing_status === "done" && r.status === "unknown" && !dismissed(key)) {
          addItem({ key, kind: "confirm_interpretation", vendor_id: v.id, response_id: resp.id, rfx_line_id: null, quote_line_id: null,
            message: `Mandatory Q${q.q_no} for ${v.name} is unclear: ${r.reason}.${r.answer_text ? ` Answer: "${r.answer_text}".` : ""} Mark it pass or fail.`,
            details: { subkind: "questionnaire", q_no: q.q_no, answer_text: r.answer_text, fingerprint: `qa:${v.id}:${q.q_no}:${r.answer_text}` } });
        }
      }
    }
    summary.mandatory_pass = !!resp && summary.mandatory_failures.length === 0 && summary.mandatory_unknown.length === 0;
    if (resp && resp.processing_status === "done" && unanswered.length) {
      const key = `unanswered:${resp.id}`;
      if (!dismissed(key)) addItem({ key, kind: "unanswered_question", vendor_id: v.id, response_id: resp.id, rfx_line_id: null, quote_line_id: null,
        message: `${v.name} did not answer ${unanswered.length} of ${b.questions.length} questions: ${unanswered.map((n) => `Q${n}`).join(", ")}.`,
        details: { q_nos: unanswered, fingerprint: `unanswered:${v.id}:${unanswered.join(",")}` } });
    }
    for (const a of vFacts) {
      if (a.valid_until && a.valid_until < b.rfx.rfx_date) {
        const key = `cert:${a.id}`;
        summary.flags.push(`Expired certificate: ${a.fact_type} (valid until ${a.valid_until})`);
        if (!dismissed(key) && !res(key)) addItem({ key, kind: "expired_cert", vendor_id: v.id, response_id: resp!.id, rfx_line_id: null, quote_line_id: null,
          message: `${v.name}'s ${String(a.details?.standard ?? a.fact_type)} certificate expired on ${a.valid_until}, before the RFx date (${b.rfx.rfx_date}).`,
          details: { fact_type: a.fact_type, valid_until: a.valid_until, cert_no: a.cert_no, fingerprint: `cert:${v.id}:${a.fact_type}:${a.valid_until}` } });
      }
    }
  }

  function evalQuestion(q: Question, vendorId: string, responseId: string | null, facts: AttachmentFactRow[]): QuestionResult {
    const req = q.requirement ?? {};
    const mandatory = !!(req.mandatory || req.must);
    const out: QuestionResult = { question_id: q.id, q_no: q.q_no, code: q.code, text: q.text, mandatory, vendor_id: vendorId, status: "not_answered", answer_text: null, reason: "Not answered", provenance: null };
    if (!responseId) { out.reason = "No response"; return out; }
    const a = b.answers.find((x) => x.response_id === responseId && x.question_id === q.id);
    const override = res(`qa:${responseId}:${q.q_no}`);
    const code = (q.code ?? "").toLowerCase();
    const cert = code ? facts.find((f) => f.fact_type.toLowerCase().replace(/[^a-z0-9]/g, "").includes(code.replace(/[^a-z0-9]/g, ""))) : undefined;
    if (a) { out.answer_text = a.answer_text; out.provenance = a.provenance; }
    if (override && typeof override.status === "string") { out.status = override.status as QStatus; out.reason = `Set by buyer${override.note ? `: ${override.note}` : ""}`; return out; }
    if (cert) {
      const valid = cert.valid_until ? cert.valid_until >= b.rfx.rfx_date : null;
      out.provenance = cert.provenance ?? out.provenance;
      if (valid === false) { out.status = "fail"; out.reason = `Certificate expired ${cert.valid_until} (before RFx date ${b.rfx.rfx_date})`; return out; }
      if (valid === true) { out.status = "pass"; out.reason = `Valid certificate${cert.cert_no ? ` ${cert.cert_no}` : ""} until ${cert.valid_until}`; return out; }
      out.status = "unknown"; out.reason = "Certificate attached but validity date not readable"; return out;
    }
    if (!a) return out;
    const n = a.normalized ?? {};
    if (req.evidence === "gstin") {
      const m = (a.answer_text ?? "").toUpperCase().match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/);
      out.status = m ? "pass" : n.value_bool === false ? "fail" : "unknown";
      out.reason = m ? `GSTIN ${m[0]}` : "No valid GSTIN given";
      return out;
    }
    switch (req.type) {
      case "boolean":
        if (n.value_bool === true) {
          if (req.evidence === "certificate") { out.status = "unknown"; out.reason = "Claimed, but no certificate attached"; }
          else { out.status = "pass"; out.reason = "Yes"; }
        } else if (n.value_bool === false) { out.status = "fail"; out.reason = "No"; }
        else { out.status = "unknown"; out.reason = "Answer is not a clear yes/no"; }
        return out;
      case "min":
      case "max": {
        const x = n.value_number;
        if (x == null) { out.status = "unknown"; out.reason = "No number given"; return out; }
        const ok = req.type === "min" ? x >= (req.value ?? 0) : x <= (req.value ?? Infinity);
        out.status = ok ? "pass" : "fail";
        out.reason = `${fmt(x, 0)} ${n.value_unit ?? req.unit ?? ""} vs ${req.type === "min" ? "min" : "max"} ${req.value} ${req.unit ?? ""}`.trim();
        return out;
      }
      default:
        out.status = "pass"; out.reason = "Answered"; return out;
    }
  }

  return { cells, vendors, questions, openItems: derived, fxUsed };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function hashStr(t: string): string {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function packWord(unit: string | null): string {
  const u = (unit ?? "").toLowerCase();
  for (const w of ["bundle", "box", "carton", "pack", "bale", "case"]) if (u.includes(w)) return w;
  return "pack";
}

export function compactList(ns: number[]): string {
  const s = [...new Set(ns)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i + 1 ? `${s[i]}–${s[j]}` : j === i + 1 ? `${s[i]}, ${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(", ");
}
