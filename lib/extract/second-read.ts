import "server-only";
import { z } from "zod";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { chat, textOf, type StatusFn } from "../llm";
import { MODELS } from "../models";
import type { ExtractionT } from "./schema";

// Second, independent read for photos/scans. Model confidence is not reliable
// on angled photos (rows drift and values shift by one row while the model
// still reports high confidence), so every image reply is re-read with a
// different framing: look up each RFx item by its printed size and report what
// is printed on that same row. Lines where the two reads disagree keep the
// first value but get low confidence (⚠ for the buyer), with both readings
// shown. Deterministic comparison; the model never decides which read wins.

// Lenient on purpose: missing optional fields mean "not stated".
const numish = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v.replace(/,/g, ""))) ? Number(v.replace(/,/g, "")) : v), z.number().nullish());
const Check = z.object({
  rows: z.array(z.object({
    rfx_line_no: z.preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int()),
    found: z.boolean().nullish(),
    printed_row_label: z.preprocess((v) => (v == null ? v : String(v)), z.string().nullish()),
    size_text: z.string().nullish(),
    price_value: numish,
    unit_text: z.string().nullish(),
    weight_per_piece_kg: numish,
  }).transform((r) => ({ ...r, found: r.found ?? r.price_value != null, printed_row_label: r.printed_row_label ?? null, size_text: r.size_text ?? null, price_value: r.price_value ?? null, unit_text: r.unit_text ?? null, weight_per_piece_kg: r.weight_per_piece_kg ?? null }))),
});

const SYSTEM = `You verify a supplier's price reply (it may be a photo, scan, PDF, spreadsheet or plain text). For each requested item, find the row or sentence that prices it — match on size/dimensions first, then on the item description. Then report ONLY what is written on that same row or sentence: its row number/label or cell/paragraph reference, the size text, the price exactly as written (no conversion), the price unit as written, and the per-piece weight if one is written there. Read straight across the row; never take a value from the row above or below. Only report prices written specifically for that item (not group statements like 'all 5-ply' or 'same as last year'). If nothing matches, set found=false and the values to null. Output only JSON: {"rows":[{"rfx_line_no":1,"found":true,"printed_row_label":"1","size_text":"...","price_value":9.48,"unit_text":"/pc","weight_per_piece_kg":null}]}`;

const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.011));

export async function secondRead(
  x: ExtractionT,
  content: ChatCompletionContentPart[],
  items: { line_no: number; description: string; spec: Record<string, unknown> }[],
  isPhoto: boolean,
  onStatus?: StatusFn,
): Promise<{ checked: number; disagreements: string[]; recovered: string[]; model: string | null }> {
  const quoted = x.line_quotes.filter((q) => q.rfx_line_no != null && q.price_value != null && q.origin === "stated");
  const covered = new Set<number>([...x.line_quotes.map((q) => q.rfx_line_no).filter((n): n is number => n != null), ...x.references.flatMap((r) => r.applies_to_line_nos)]);
  if (!content.length) return { checked: 0, disagreements: [], recovered: [], model: null };
  const wanted = items;
  const list = wanted.map((i) => `Line ${i.line_no}: ${i.description} | size ${String(i.spec.dimensions_mm ?? "")}`).join("\n");
  onStatus?.("Double-checking with a second read…");
  let r;
  try {
    r = await chat("extraction", {
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: [...content, { type: "text", text: `Items to look up:\n${list}` }] }],
      max_tokens: 16000, temperature: 0, response_format: { type: "json_object" },
    }, { models: MODELS.extraction.chain, onStatus });
  } catch {
    // If the check itself cannot run, say so and flag the reply rather than trusting it silently.
    x.notes.push("Second read could not run; values are unverified.");
    if (isPhoto) x.overall_confidence = Math.min(x.overall_confidence, 0.6);
    return { checked: 0, disagreements: [], recovered: [], model: null };
  }
  const t = textOf(r);
  const parsed = Check.safeParse((() => { try { return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { return null; } })());
  if (!parsed.success) {
    x.notes.push(`Second read returned an unreadable result; values are unverified. (${parsed.error.issues.slice(0, 2).map((i) => i.path.join(".") + " " + i.message).join("; ")}; output starts: ${t.slice(0, 120)})`);
    if (isPhoto) x.overall_confidence = Math.min(x.overall_confidence, 0.6);
    return { checked: 0, disagreements: [], recovered: [], model: r.model };
  }
  const disagreements: string[] = [];
  for (const q of quoted) {
    const c = parsed.data.rows.find((row) => row.rfx_line_no === q.rfx_line_no);
    if (!c) continue;
    const priceOk = c.found && near(c.price_value, q.price_value);
    const weightOk = !c.found || c.weight_per_piece_kg == null || q.weight_per_piece_kg == null ? (c.weight_per_piece_kg ?? null) === (q.weight_per_piece_kg ?? null) || !c.found : near(c.weight_per_piece_kg, q.weight_per_piece_kg);
    if (priceOk && weightOk) continue;
    const second = c.found ? `${c.price_value ?? "?"} ${c.unit_text ?? ""}${c.weight_per_piece_kg != null ? `, ${c.weight_per_piece_kg} kg/pc` : ""} (row "${c.printed_row_label ?? "?"}", size "${c.size_text ?? "?"}")` : "no matching row found";
    const first = `${q.price_value} ${q.price_unit_as_written}${q.weight_per_piece_kg != null ? `, ${q.weight_per_piece_kg} kg/pc` : ""}`;
    q.confidence = Math.min(q.confidence, 0.4);
    q.match_reason = `${q.match_reason} | ⚠ Second read disagrees: first read ${first}; second read ${second}.`;
    disagreements.push(`line ${q.rfx_line_no}: ${first} vs ${second}`);
  }
  // Lines the first read missed entirely but the second read found priced:
  // kept (never dropped) as low-confidence values the buyer must confirm.
  const recovered: string[] = [];
  for (const c of parsed.data.rows) {
    if (!c.found || c.price_value == null || covered.has(c.rfx_line_no) || !items.some((i) => i.line_no === c.rfx_line_no)) continue;
    const unit = (c.unit_text ?? "").toLowerCase();
    const per = /(\d[\d,]*)\s*$/.exec(unit.replace(/[^0-9a-z ,]/g, " ").trim());
    const basis = /kg|kilo/.test(unit) ? "per_kg" : /tonne|\bt\b|mt/.test(unit) ? "per_tonne" : /dozen/.test(unit) ? "per_n" : /1000|100\b|per \d/.test(unit) ? "per_n" : /box|bundle|pack|carton/.test(unit) ? "per_pack" : "per_unit";
    const n = /dozen/.test(unit) ? 12 : basis === "per_n" && per ? Number(per[1].replace(/,/g, "")) : null;
    x.line_quotes.push({
      vendor_line_text: c.size_text ?? `row ${c.printed_row_label ?? "?"}`, rfx_line_no: c.rfx_line_no, match_confidence: 0.5,
      match_reason: `⚠ Found only by the second read (row "${c.printed_row_label ?? "?"}", size "${c.size_text ?? "?"}"); the first read did not list this line. Confirm against the original.`,
      price_value: c.price_value, currency: x.line_quotes.find((q) => q.currency)?.currency ?? "INR", price_unit_as_written: c.unit_text ?? "", price_basis: basis,
      basis_count: n, basis_item: "unknown", pieces_per_pack: null, weight_per_piece_kg: c.weight_per_piece_kg, offered_spec: null, deviation: [], origin: "stated", confidence: 0.3,
      provenance: { file: "(second read)", locator: c.printed_row_label ? `row ${c.printed_row_label}` : "second read", snippet: `${c.size_text ?? ""} ${c.price_value} ${c.unit_text ?? ""}`.trim() },
    });
    recovered.push(`line ${c.rfx_line_no}: ${c.price_value} ${c.unit_text ?? ""}`);
  }
  if (disagreements.length) {
    x.notes.push(`Second read disagreed on ${disagreements.length} of ${quoted.length} lines: ${disagreements.join("; ")}`);
    if (isPhoto && (disagreements.length >= 3 || disagreements.length / Math.max(quoted.length, 1) >= 0.2)) x.overall_confidence = Math.min(x.overall_confidence, 0.5);
  } else x.notes.push(`Second read agreed on all ${quoted.length} checked lines.`);
  if (recovered.length) x.notes.push(`Second read found ${recovered.length} priced line(s) the first read missed (added with ⚠): ${recovered.join("; ")}`);
  return { checked: quoted.length, disagreements, recovered, model: r.model };
}
