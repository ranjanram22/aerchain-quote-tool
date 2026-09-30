// Strict output contract for the extraction model. Validated with zod; the
// JSON Schema derived from it is shown to the model in the prompt.
import { z } from "zod";

const num = z.number().finite();
const nullableNum = num.nullable();
const conf = z.number().min(0).max(1);

export const Provenance = z.object({
  file: z.string().describe("Source file name exactly as given, or 'email body'"),
  locator: z.string().describe("Where in the source: sheet!cell, page N, paragraph N, table row N, or 'photo, row N'"),
  snippet: z.string().max(300).describe("Verbatim text copied from the source (≤ 200 chars)"),
});

export const PriceBasis = z.enum([
  "per_unit", // one piece / one set / one kg, same as the price unit written next to it
  "per_n", // per N pieces/sets (e.g. per 100, per 1000, per dozen) — put N in basis_count
  "per_pack", // per box / bundle / carton / pack of several pieces — put pieces in pieces_per_pack if stated, else null
  "per_kg",
  "per_tonne",
]);

export const LineQuote = z.object({
  vendor_line_text: z.string().describe("The vendor's own description of the item, verbatim"),
  rfx_line_no: z.number().int().nullable().describe("Matched RFx line number, or null if it matches no RFx line"),
  match_confidence: conf,
  match_reason: z.string().describe("Short reason for the match (size, ply, paper, position)"),
  price_value: nullableNum.describe("Numeric price exactly as written (no conversion). null if the line is listed but has no price"),
  currency: z.string().nullable().describe("ISO code as stated or clearly implied (INR for Rs/₹/rupees, USD for $ when the document says USD)"),
  price_unit_as_written: z.string().describe("The unit/basis text as written, e.g. 'per 100 nos', '/kg', 'per box of 50', 'each'"),
  price_basis: PriceBasis,
  basis_count: nullableNum.describe("For per_n: N (100, 1000, 12 …). Otherwise null"),
  basis_item: z.enum(["piece", "set", "kg", "unknown"]).describe("What one counted item is (piece, set, kg)"),
  pieces_per_pack: nullableNum.describe("Pieces (or sets) per pack/box/bundle only if the source states it; else null"),
  weight_per_piece_kg: nullableNum.describe("Weight of one piece in kg only if the source states it for this item; else null"),
  offered_spec: z.record(z.string(), z.unknown()).nullable().describe("Spec as offered by the vendor when stated (ply, flute, paper_gsm, bf, dimensions_mm, print …)"),
  deviation: z
    .object({ field: z.string(), requested: z.string(), offered: z.string(), note: z.string() })
    .array()
    .describe("Each way the offered spec differs from the requested spec. Empty if none"),
  origin: z.enum(["stated", "inferred"]).describe("stated = price written for this item; inferred = you applied a group statement to this line"),
  confidence: conf,
  provenance: Provenance,
});

export const Reference = z.object({
  phrase: z.string().describe("Verbatim phrase, e.g. 'rest same as last year'"),
  kind: z.enum(["same_as_last_year", "same_as_previous_quote", "other"]),
  applies_to_line_nos: z.array(z.number().int()).describe("RFx line numbers the phrase applies to (expand 'rest'/'all others' to the actual line numbers not otherwise priced)"),
  adjustment_pct: nullableNum.describe("If the phrase states a change (e.g. '2% less than last time' → -2). Else null"),
  confidence: conf,
  provenance: Provenance,
});

const Term = z.object({ text: z.string(), provenance: Provenance }).nullable();

export const Freight = z.object({
  basis: z.enum(["included", "extra_unknown", "per_shipment", "per_unit", "per_kg", "percent", "lump_sum", "not_mentioned"]),
  amount: nullableNum,
  currency: z.string().nullable(),
  shipments_per_year: nullableNum.describe("Only if the source states a shipment frequency; convert per month × 12 etc."),
  note: z.string().describe("Verbatim or near-verbatim freight wording"),
  provenance: Provenance.nullable(),
});

export const Discount = z.object({
  kind: z.enum(["percent", "amount_per_unit", "lump_sum"]),
  value: num,
  condition: z.string().nullable().describe("Condition verbatim (e.g. payment within 15 days). null if unconditional"),
  applies_to: z.string().describe("'all lines' or which lines"),
  applies_to_line_nos: z.array(z.number().int()).nullable(),
  provenance: Provenance,
});

export const CommercialTerms = z.object({
  freight: Freight,
  discounts: z.array(Discount),
  gst: Term,
  payment_terms: Term,
  validity: Term,
  lead_time: z.object({ days: nullableNum, text: z.string(), provenance: Provenance }).nullable(),
  incoterm: Term,
  other: z.array(z.object({ label: z.string(), text: z.string(), provenance: Provenance })),
});

export const QuestionAnswer = z.object({
  q_no: z.number().int(),
  answer_text: z.string().describe("The vendor's answer, verbatim or closely paraphrased"),
  value_bool: z.boolean().nullable(),
  value_number: nullableNum.describe("Numeric value in the unit the question asks for, if applicable"),
  value_unit: z.string().nullable(),
  confidence: conf,
  provenance: Provenance,
});

export const Attachment = z.object({
  file: z.string(),
  type: z.enum(["quote", "certificate", "test_report", "other"]),
  certificate: z
    .object({
      standard: z.string().describe("e.g. ISO 9001:2015, FSC Chain of Custody"),
      fact_type: z.string().describe("snake_case key, e.g. iso9001_cert, fsc_cert, iso14001_cert"),
      holder: z.string().nullable(),
      issuer: z.string().nullable(),
      cert_no: z.string().nullable(),
      issued_on: z.string().nullable().describe("YYYY-MM-DD"),
      valid_until: z.string().nullable().describe("YYYY-MM-DD"),
    })
    .nullable(),
  summary: z.string().describe("One line on what the file contains (e.g. test results)"),
  provenance: Provenance,
});

export const Extraction = z.object({
  line_quotes: z.array(LineQuote),
  references: z.array(Reference),
  commercial_terms: CommercialTerms,
  questionnaire_answers: z.array(QuestionAnswer),
  attachments: z.array(Attachment),
  image_quality: z
    .object({ file: z.string(), issues: z.array(z.string()), readable: z.enum(["fully", "mostly", "partly", "no"]) })
    .array()
    .describe("One entry per image or scanned page"),
  notes: z.array(z.string()).describe("Anything you are unsure about, stated plainly"),
  overall_confidence: conf,
});

export type ExtractionT = z.infer<typeof Extraction>;
export type LineQuoteT = z.infer<typeof LineQuote>;

export const extractionJsonSchema = () => JSON.stringify(z.toJSONSchema(Extraction), null, 0);
