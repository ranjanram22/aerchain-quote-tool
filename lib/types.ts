// Shapes of the rows the normalizer reads. Loaded by lib/rfx-data.ts.

export interface Prov {
  file?: string;
  file_id?: string | null;
  locator?: string;
  snippet?: string;
}

export interface RfxLine {
  id: string;
  line_no: number;
  line_key: string | null;
  description: string;
  category: string | null;
  spec: Record<string, unknown>;
  unit: string;
  annual_qty: number | null;
}

export interface Question {
  id: string;
  q_no: number;
  code: string | null;
  text: string;
  requirement: { type?: string; must?: boolean; mandatory?: boolean; preferred?: boolean; value?: number; unit?: string; evidence?: string; expected?: string };
  weight: number;
}

export interface VendorRow {
  id: string;
  name: string;
  email: string | null;
  contact_name: string | null;
}

export interface ResponseRow {
  id: string;
  vendor_id: string;
  received_at: string;
  version: number;
  processing_status: string;
  error: string | null;
  raw_email_text: string | null;
}

export interface QuoteLineRow {
  id: string;
  response_id: string;
  line_no: number | null;
  matched_rfx_line_id: string | null;
  vendor_line_text: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  price_value: number | null;
  price_currency: string | null;
  price_unit_as_written: string | null;
  qty_basis: string | null; // per_unit | per_n | per_pack | per_kg | per_tonne
  basis_count: number | null;
  basis_item: string | null;
  pieces_per_pack: number | null;
  weight_per_piece_kg: number | null;
  offered_spec: Record<string, unknown> | null;
  deviation: { field: string; requested: string; offered: string; note: string; verified?: boolean }[] | null;
  provenance: Prov;
  confidence: number | null;
  value_origin: "stated" | "inferred" | "assumed" | "buyer_input";
  extraction_id: string | null;
}

export interface FreightTerms {
  basis: "included" | "extra_unknown" | "per_shipment" | "per_unit" | "per_kg" | "percent" | "lump_sum" | "not_mentioned";
  amount: number | null;
  currency: string | null;
  shipments_per_year: number | null;
  note: string;
  provenance: Prov | null;
}

export interface DiscountTerm {
  kind: "percent" | "amount_per_unit" | "lump_sum";
  value: number;
  condition: string | null;
  applies_to: string;
  applies_to_line_nos: number[] | null;
  provenance: Prov;
}

export interface TermsRow {
  response_id: string;
  freight: FreightTerms | null;
  discounts: DiscountTerm[];
  gst: { text: string; provenance: Prov } | null;
  payment_terms: { text: string; provenance: Prov } | null;
  validity: { text: string; provenance: Prov } | null;
  lead_time: { days: number | null; text: string; provenance: Prov } | null;
  incoterm: { text: string; provenance: Prov } | null;
  other: { label: string; text: string; provenance: Prov }[];
}

export interface ReferenceRow {
  phrase: string;
  kind: "same_as_last_year" | "same_as_previous_quote" | "other";
  applies_to_line_nos: number[];
  adjustment_pct: number | null;
  confidence: number;
  provenance: Prov;
}

export interface ExtractionRow {
  id: string;
  response_id: string;
  model: string;
  overall_confidence: number | null;
  created_at: string;
  references: ReferenceRow[];
  notes: string[];
  image_quality: { file: string; issues: string[]; readable: string }[];
}

export interface AnswerRow {
  id: string;
  response_id: string;
  question_id: string;
  answer_text: string | null;
  normalized: { value_bool?: boolean | null; value_number?: number | null; value_unit?: string | null; confidence?: number } | null;
  provenance: Prov;
}

export interface AttachmentFactRow {
  id: string;
  response_id: string | null;
  response_file_id: string | null;
  fact_type: string;
  issuer: string | null;
  cert_no: string | null;
  valid_until: string | null;
  is_valid_on_rfx_date: boolean | null;
  details: Record<string, unknown> | null;
  provenance: Prov;
}

export interface FileRow {
  id: string;
  response_id: string;
  filename: string;
  mime: string | null;
  kind: string;
  storage_path: string;
  processing_status: string;
  error: string | null;
}

export interface FxRow {
  currency: string;
  rate_to_inr: number;
  as_of: string;
}

export interface LastYearRow {
  id: string;
  vendor_id: string;
  line_key: string;
  description: string | null;
  unit: string;
  price_inr: number;
  contract_ref: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export interface OpenItemRow {
  id: string;
  key: string | null;
  kind: string;
  vendor_id: string | null;
  rfx_line_id: string | null;
  quote_line_id: string | null;
  response_id: string | null;
  message: string;
  details: Record<string, unknown> | null;
  status: "open" | "resolved" | "dismissed";
  resolution: Record<string, unknown> | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface RfxBundle {
  rfx: { id: string; title: string; category: string | null; location: string | null; scope: string | null; terms: Record<string, unknown>; status: string; rfx_date: string; created_at: string; closed_at?: string | null; closed_note?: string | null };
  lines: RfxLine[];
  questions: Question[];
  vendors: VendorRow[]; // invited vendors
  responses: ResponseRow[]; // latest (not superseded) per vendor
  quoteLines: QuoteLineRow[];
  terms: TermsRow[];
  extractions: ExtractionRow[]; // latest per response
  answers: AnswerRow[];
  attachments: AttachmentFactRow[];
  files: FileRow[];
  fx: FxRow[];
  lastYear: LastYearRow[];
  openItems: OpenItemRow[];
}
