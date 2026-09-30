// Seed master data for the demo: vendors, catalog, the RFx, questionnaire,
// last-year contract prices and FX. This is what a buyer would already have
// in the system before any vendor replies. Vendor *quotes* are NOT here; they
// only exist inside the generated files in seed/files and reach the database
// through the real extraction pipeline.

export const RFX_DATE = "2026-09-22";

export interface SeedVendor {
  key: "A" | "B" | "C" | "D" | "E";
  name: string;
  contact_name: string;
  email: string;
  city: string;
  state: string;
  gstin: string | null;
  categories: string[];
}

export const VENDORS: SeedVendor[] = [
  {
    key: "A",
    name: "Transpac Global Packaging (India) Pvt Ltd",
    contact_name: "Nikhil Arora",
    email: "nikhil.arora@transpac-global.example",
    city: "Bhiwandi",
    state: "Maharashtra",
    gstin: "27AAHCT4821K1Z6",
    categories: ["Corrugated boxes", "Printed packaging", "Export packaging"],
  },
  {
    key: "B",
    name: "Shree Ganesh Corrugators",
    contact_name: "Prakash Kulkarni",
    email: "sales@shreeganeshcorrugators.example",
    city: "Bhosari, Pune",
    state: "Maharashtra",
    gstin: "27ABKPK7765M1Z2",
    categories: ["Corrugated boxes", "Corrugated sheets", "Partitions"],
  },
  {
    key: "C",
    name: "Deccan Board & Boxes Pvt Ltd",
    contact_name: "Sunita Jadhav",
    email: "sunita.j@deccanboard.example",
    city: "Satara",
    state: "Maharashtra",
    gstin: "27AADCD3390P1Z9",
    categories: ["Corrugated boxes", "Mailer boxes", "Partitions"],
  },
  {
    key: "D",
    name: "Mahalaxmi Packaging Works",
    contact_name: "Rajesh Patil",
    email: "mahalaxmipack@example.com",
    city: "Nashik",
    state: "Maharashtra",
    gstin: "27AAPFM5512D1Z4",
    categories: ["Corrugated boxes", "Corrugated sheets", "Heavy-duty boxes"],
  },
  {
    key: "E",
    name: "Om Sai Cartons",
    contact_name: "Santosh Shinde",
    email: "omsaicartons@example.com",
    city: "Chakan, Pune",
    state: "Maharashtra",
    gstin: "27AMQPS2204H1Z1",
    categories: ["Corrugated boxes"],
  },
];

export interface SeedLine {
  line_no: number;
  line_key: string;
  category: string;
  name: string; // short catalog name
  type: string;
  ply: number | null;
  flute: string | null;
  gsm: string | null; // paper GSM per layer, outer to inner
  bf: string | null;
  dims: [number, number, number] | null; // L x W x H mm
  print: string;
  unit: "piece" | "kg" | "set";
  annual_qty: number;
  burst_kg_cm2?: number;
  bct_kgf?: number;
  approx_weight_kg?: number; // stated in RFx spec only where known from the current contract
  extra?: string;
  fair: number; // internal: reference INR price per unit used by the file generators only
}

const L = (l: Omit<SeedLine, "line_key"> & { line_key?: string }): SeedLine => ({
  line_key: l.line_key ?? `L${String(l.line_no).padStart(2, "0")}`,
  ...l,
});

// Board recipes
const G3 = "150/120/150";
const G5 = "180/120/150/120/180";
const G7 = "200/120/150/120/150/120/200";

export const LINES: SeedLine[] = [
  // 3-ply RSC shipper boxes
  L({ line_no: 1, line_key: "3P-RSC-250", category: "3-ply RSC", name: "3-ply RSC box 250x200x150", type: "RSC box", ply: 3, flute: "B", gsm: G3, bf: "18", dims: [250, 200, 150], print: "Plain", unit: "piece", annual_qty: 140000, burst_kg_cm2: 7, approx_weight_kg: 0.21, fair: 9.2 }),
  L({ line_no: 2, line_key: "3P-RSC-300A", category: "3-ply RSC", name: "3-ply RSC box 300x200x200", type: "RSC box", ply: 3, flute: "B", gsm: G3, bf: "18", dims: [300, 200, 200], print: "Plain", unit: "piece", annual_qty: 110000, burst_kg_cm2: 7, approx_weight_kg: 0.26, fair: 11.4 }),
  L({ line_no: 3, line_key: "3P-RSC-300B", category: "3-ply RSC", name: "3-ply RSC box 300x250x150", type: "RSC box", ply: 3, flute: "B", gsm: G3, bf: "18", dims: [300, 250, 150], print: "Plain", unit: "piece", annual_qty: 90000, burst_kg_cm2: 7, approx_weight_kg: 0.27, fair: 11.8 }),
  L({ line_no: 4, line_key: "3P-RSC-350", category: "3-ply RSC", name: "3-ply RSC box 350x250x200", type: "RSC box", ply: 3, flute: "C", gsm: G3, bf: "18", dims: [350, 250, 200], print: "Plain", unit: "piece", annual_qty: 75000, burst_kg_cm2: 8, approx_weight_kg: 0.315, fair: 13.9 }),
  L({ line_no: 5, line_key: "3P-RSC-200", category: "3-ply RSC", name: "3-ply RSC box 200x150x100", type: "RSC box", ply: 3, flute: "B", gsm: G3, bf: "16", dims: [200, 150, 100], print: "Plain", unit: "piece", annual_qty: 190000, burst_kg_cm2: 6, approx_weight_kg: 0.185, fair: 8.1 }),
  L({ line_no: 6, line_key: "3P-RSC-400", category: "3-ply RSC", name: "3-ply RSC box 400x300x200", type: "RSC box", ply: 3, flute: "C", gsm: G3, bf: "18", dims: [400, 300, 200], print: "Plain", unit: "piece", annual_qty: 60000, burst_kg_cm2: 8, approx_weight_kg: 0.355, fair: 15.6 }),
  L({ line_no: 7, line_key: "3P-RSC-250C", category: "3-ply RSC", name: "3-ply RSC cube box 250x250x250", type: "RSC box", ply: 3, flute: "B", gsm: G3, bf: "18", dims: [250, 250, 250], print: "Plain", unit: "piece", annual_qty: 68000, burst_kg_cm2: 7, approx_weight_kg: 0.29, fair: 12.8 }),
  L({ line_no: 8, line_key: "3P-RSC-320", category: "3-ply RSC", name: "3-ply RSC box 320x220x120", type: "RSC box", ply: 3, flute: "B", gsm: G3, bf: "16", dims: [320, 220, 120], print: "Plain", unit: "piece", annual_qty: 82000, burst_kg_cm2: 6, approx_weight_kg: 0.24, fair: 10.6 }),
  // 5-ply RSC shipper boxes
  L({ line_no: 9, line_key: "5P-RSC-400", category: "5-ply RSC", name: "5-ply RSC box 400x300x300", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "20", dims: [400, 300, 300], print: "Plain", unit: "piece", annual_qty: 68000, burst_kg_cm2: 12, bct_kgf: 450, approx_weight_kg: 0.66, fair: 31 }),
  L({ line_no: 10, line_key: "5P-RSC-450A", category: "5-ply RSC", name: "5-ply RSC box 450x350x300", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "20", dims: [450, 350, 300], print: "Plain", unit: "piece", annual_qty: 56000, burst_kg_cm2: 12, bct_kgf: 480, approx_weight_kg: 0.775, fair: 36.5 }),
  L({ line_no: 11, line_key: "5P-RSC-500A", category: "5-ply RSC", name: "5-ply RSC box 500x400x300", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "20", dims: [500, 400, 300], print: "Plain", unit: "piece", annual_qty: 45000, burst_kg_cm2: 13, bct_kgf: 520, approx_weight_kg: 0.895, fair: 42 }),
  L({ line_no: 12, line_key: "5P-RSC-500B", category: "5-ply RSC", name: "5-ply RSC box 500x300x250", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "20", dims: [500, 300, 250], print: "Plain", unit: "piece", annual_qty: 52000, burst_kg_cm2: 12, bct_kgf: 460, approx_weight_kg: 0.725, fair: 34 }),
  L({ line_no: 13, line_key: "5P-RSC-600A", category: "5-ply RSC", name: "5-ply RSC box 600x400x400", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "22", dims: [600, 400, 400], print: "Plain", unit: "piece", annual_qty: 30000, burst_kg_cm2: 14, bct_kgf: 600, approx_weight_kg: 1.21, fair: 57 }),
  L({ line_no: 14, line_key: "5P-RSC-450B", category: "5-ply RSC", name: "5-ply RSC box 450x300x350", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "20", dims: [450, 300, 350], print: "Plain", unit: "piece", annual_qty: 48000, burst_kg_cm2: 12, bct_kgf: 480, approx_weight_kg: 0.755, fair: 35.5 }),
  L({ line_no: 15, line_key: "5P-RSC-550", category: "5-ply RSC", name: "5-ply RSC box 550x450x350", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "22", dims: [550, 450, 350], print: "Plain", unit: "piece", annual_qty: 34000, burst_kg_cm2: 14, bct_kgf: 580, approx_weight_kg: 1.045, fair: 49 }),
  L({ line_no: 16, line_key: "5P-RSC-600B", category: "5-ply RSC", name: "5-ply RSC box 600x500x450", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "22", dims: [600, 500, 450], print: "Plain", unit: "piece", annual_qty: 22000, burst_kg_cm2: 15, bct_kgf: 650, approx_weight_kg: 1.425, fair: 67 }),
  // 7-ply heavy-duty
  L({ line_no: 17, line_key: "7P-HD-600", category: "7-ply heavy duty", name: "7-ply heavy-duty box 600x400x500", type: "RSC box", ply: 7, flute: "BCB", gsm: G7, bf: "24", dims: [600, 400, 500], print: "Plain", unit: "piece", annual_qty: 11000, burst_kg_cm2: 21, bct_kgf: 950, fair: 118 }),
  L({ line_no: 18, line_key: "7P-HD-800", category: "7-ply heavy duty", name: "7-ply heavy-duty box 800x600x500", type: "RSC box", ply: 7, flute: "BCB", gsm: G7, bf: "24", dims: [800, 600, 500], print: "Plain", unit: "piece", annual_qty: 6000, burst_kg_cm2: 22, bct_kgf: 1100, fair: 172 }),
  L({ line_no: 19, line_key: "7P-HD-500", category: "7-ply heavy duty", name: "7-ply heavy-duty box 500x400x400", type: "RSC box", ply: 7, flute: "BCB", gsm: G7, bf: "24", dims: [500, 400, 400], print: "Plain", unit: "piece", annual_qty: 15000, burst_kg_cm2: 20, bct_kgf: 900, fair: 94 }),
  // Die-cut mailers
  L({ line_no: 20, line_key: "MLR-250", category: "Die-cut mailer", name: "Die-cut mailer box 250x180x60", type: "Die-cut mailer", ply: 3, flute: "E", gsm: "150/100/150", bf: "18", dims: [250, 180, 60], print: "Plain", unit: "piece", annual_qty: 90000, fair: 13.5 }),
  L({ line_no: 21, line_key: "MLR-300", category: "Die-cut mailer", name: "Die-cut mailer box 300x220x80", type: "Die-cut mailer", ply: 3, flute: "E", gsm: "150/100/150", bf: "18", dims: [300, 220, 80], print: "Plain", unit: "piece", annual_qty: 68000, fair: 17.2 }),
  L({ line_no: 22, line_key: "MLR-350", category: "Die-cut mailer", name: "Die-cut mailer box 350x250x100", type: "Die-cut mailer", ply: 3, flute: "E", gsm: "180/100/150", bf: "18", dims: [350, 250, 100], print: "Plain", unit: "piece", annual_qty: 45000, fair: 21.8 }),
  // Printed boxes
  L({ line_no: 23, line_key: "PRT-3P-300", category: "Printed box", name: "3-ply RSC box 300x200x150, 1-colour flexo", type: "RSC box", ply: 3, flute: "B", gsm: G3, bf: "18", dims: [300, 200, 150], print: "1-colour flexo, 2 sides", unit: "piece", annual_qty: 150000, burst_kg_cm2: 7, fair: 12.9 }),
  L({ line_no: 24, line_key: "PRT-5P-400", category: "Printed box", name: "5-ply RSC box 400x300x250, 2-colour flexo", type: "RSC box", ply: 5, flute: "BC", gsm: G5, bf: "20", dims: [400, 300, 250], print: "2-colour flexo, 4 sides", unit: "piece", annual_qty: 60000, burst_kg_cm2: 12, bct_kgf: 430, fair: 33.5 }),
  L({ line_no: 25, line_key: "PRT-MLR-280", category: "Printed box", name: "Printed mailer 280x200x70, 2-colour flexo", type: "Die-cut mailer", ply: 3, flute: "E", gsm: "150/100/150", bf: "18", dims: [280, 200, 70], print: "2-colour flexo, outside", unit: "piece", annual_qty: 75000, fair: 18.4 }),
  // Sheets / pads (bought by weight)
  L({ line_no: 26, line_key: "SHT-3P", category: "Sheets & pads", name: "3-ply corrugated sheet 1000x800", type: "Corrugated sheet", ply: 3, flute: "B", gsm: G3, bf: "16", dims: [1000, 800, 0], print: "Plain", unit: "kg", annual_qty: 30000, fair: 48 }),
  L({ line_no: 27, line_key: "SHT-5P", category: "Sheets & pads", name: "5-ply corrugated pad 1200x1000", type: "Corrugated pad", ply: 5, flute: "BC", gsm: G5, bf: "18", dims: [1200, 1000, 0], print: "Plain", unit: "kg", annual_qty: 19000, fair: 51 }),
  // Partitions (sets)
  L({ line_no: 28, line_key: "PTN-12", category: "Partitions", name: "12-cell partition set for 400x300 box", type: "Partition", ply: 3, flute: "B", gsm: "150/120/150", bf: "16", dims: [400, 300, 280], print: "Plain", unit: "set", annual_qty: 45000, extra: "4 x 3 cells", fair: 7.8 }),
  L({ line_no: 29, line_key: "PTN-24", category: "Partitions", name: "24-cell partition set for 500x400 box", type: "Partition", ply: 3, flute: "B", gsm: "150/120/150", bf: "16", dims: [500, 400, 280], print: "Plain", unit: "set", annual_qty: 22000, extra: "6 x 4 cells", fair: 12.6 }),
  // Edge protectors
  L({ line_no: 30, line_key: "EDG-50", category: "Edge protectors", name: "Paperboard edge protector 50x50x5, 1000 mm", type: "Edge protector", ply: null, flute: null, gsm: null, bf: null, dims: [50, 50, 1000], print: "Plain", unit: "piece", annual_qty: 110000, extra: "5 mm wall, L-profile", fair: 6.4 }),
];

export function lineSpec(l: SeedLine) {
  const spec: Record<string, unknown> = { type: l.type };
  if (l.ply) spec.ply = l.ply;
  if (l.flute) spec.flute = l.flute;
  if (l.gsm) spec.paper_gsm = l.gsm;
  if (l.bf) spec.bf = l.bf;
  if (l.dims) {
    const [a, b, c] = l.dims;
    spec.dimensions_mm = l.type.includes("sheet") || l.type.includes("pad") ? `${a} x ${b}` : `${a} x ${b} x ${c}`;
  }
  spec.print = l.print;
  if (l.burst_kg_cm2) spec.burst_strength_kg_cm2 = l.burst_kg_cm2;
  if (l.bct_kgf) spec.bct_kgf = l.bct_kgf;
  if (l.approx_weight_kg) spec.approx_weight_kg = l.approx_weight_kg;
  if (l.extra) spec.notes = l.extra;
  return spec;
}

export function lineDescription(l: SeedLine) {
  const s = lineSpec(l);
  const bits = [l.name];
  if (s.paper_gsm) bits.push(`GSM ${s.paper_gsm}`);
  if (s.bf) bits.push(`BF ${s.bf}`);
  if (s.flute) bits.push(`${s.flute} flute`);
  return bits.join(", ");
}

export const QUESTIONS = [
  { q_no: 1, code: "iso9001", text: "Do you hold a valid ISO 9001 certification? Please attach the certificate.", requirement: { type: "boolean", must: true, mandatory: true, evidence: "certificate" }, weight: 3 },
  { q_no: 2, code: "fsc", text: "Are you FSC (Forest Stewardship Council) certified? Please attach the certificate if yes.", requirement: { type: "boolean", preferred: true, mandatory: false }, weight: 1 },
  { q_no: 3, code: "inhouse_testing", text: "Do you have in-house burst strength, BCT and ECT testing? Will you share test reports per lot?", requirement: { type: "boolean", must: true, mandatory: true }, weight: 3 },
  { q_no: 4, code: "monthly_capacity", text: "What is your monthly converting capacity (MT/month)?", requirement: { type: "min", value: 300, unit: "MT/month", mandatory: false }, weight: 2 },
  { q_no: 5, code: "plant_distance", text: "Where is your manufacturing plant and what is the distance to our Chakan (Pune) plant in km?", requirement: { type: "max", value: 250, unit: "km", mandatory: false }, weight: 1 },
  { q_no: 6, code: "lead_time", text: "What is your standard lead time from PO to delivery (days)?", requirement: { type: "max", value: 10, unit: "days", mandatory: false }, weight: 2 },
  { q_no: 7, code: "payment_terms", text: "Do you accept payment terms of 60 days from receipt of goods?", requirement: { type: "boolean", preferred: true, mandatory: false, expected: "60 days from GRN" }, weight: 1 },
  { q_no: 8, code: "qc_process", text: "Describe your quality control process (incoming paper, in-process, final inspection).", requirement: { type: "text", mandatory: false }, weight: 1 },
  { q_no: 9, code: "printing", text: "Do you have in-house flexo printing up to 2 colours?", requirement: { type: "boolean", preferred: true, mandatory: false }, weight: 1 },
  { q_no: 10, code: "food_pharma_clients", text: "List current food, FMCG or pharma customers you supply.", requirement: { type: "text", mandatory: false }, weight: 1 },
  { q_no: 11, code: "contingency", text: "What is your contingency plan for supply disruption (backup plant, paper stock)?", requirement: { type: "text", mandatory: false }, weight: 1 },
  { q_no: 12, code: "gst", text: "Please confirm your GST registration number (GSTIN).", requirement: { type: "boolean", preferred: true, mandatory: false, evidence: "gstin" }, weight: 1 },
];

export const RFX = {
  title: "Corrugated Packaging — Chakan Plant FY27 Annual Contract",
  category: "Corrugated packaging",
  location: "Chakan plant, Pune, Maharashtra",
  scope:
    "Annual rate contract (Apr 2027 – Mar 2028) for corrugated shipper boxes (3/5/7-ply), die-cut mailers, printed boxes, corrugated sheets and pads, partitions and edge protectors for the Chakan FMCG plant. Scheduled call-offs against monthly forecasts.",
  terms: {
    response_deadline: "2026-10-06",
    validity_required_days: 90,
    payment_terms: "60 days from GRN",
    delivery_terms: "DAP Chakan plant (door delivery)",
    incoterm: "DAP",
    freight_expectation: "Include freight to Chakan plant in unit prices. If freight is extra, state the amount and basis.",
    gst_treatment: "Quote prices excluding GST; state GST rate separately.",
    currency: "INR preferred; other currencies accepted with the currency clearly stated.",
    contract_period: "1 Apr 2027 – 31 Mar 2028",
  },
};

// Last-year contract prices (FY26). Incumbent E on most lines, B on shipper
// boxes and mailers. INR per RFx unit.
export const LAST_YEAR: { vendor: "B" | "E"; line_no: number; price_inr: number }[] = [
  // Om Sai Cartons (incumbent)
  ...[
    [1, 8.9], [2, 10.95], [3, 11.4], [4, 13.4], [5, 7.85], [6, 15.05], [7, 12.35], [8, 10.25],
    [9, 29.9], [10, 35.2], [11, 40.6], [12, 32.8], [13, 55.1], [14, 34.3], [15, 47.3], [16, 64.8],
    [17, 108.0], [18, 176.0], [19, 99.8], [20, 12.95], [21, 17.9], [22, 22.9],
    [23, 13.85], [24, 31.2], [25, 19.6], [26, 45.5], [27, 52.9], [28, 8.1],
  ].map(([line_no, price_inr]) => ({ vendor: "E" as const, line_no, price_inr })),
  // Shree Ganesh Corrugators
  ...[
    [1, 8.75], [2, 10.9], [3, 11.3], [4, 13.35], [5, 7.8], [6, 14.95], [7, 12.3], [8, 10.2],
    [9, 29.8], [10, 35.0], [11, 40.3], [12, 32.6], [13, 54.7], [14, 34.1], [15, 47.0], [16, 64.5],
    [20, 13.2], [21, 16.8], [22, 21.3],
  ].map(([line_no, price_inr]) => ({ vendor: "B" as const, line_no, price_inr })),
];

export const LAST_YEAR_CONTRACT = {
  E: { ref: "PO/CHK/FY26/RC-014", valid_from: "2025-04-01", valid_to: "2026-03-31" },
  B: { ref: "PO/CHK/FY26/RC-022", valid_from: "2025-04-01", valid_to: "2026-03-31" },
};

export const FX = [
  { currency: "USD", rate_to_inr: 88.4, as_of: "2026-09-25", source_note: "RBI reference rate (seeded for demo)" },
  { currency: "EUR", rate_to_inr: 103.15, as_of: "2026-09-25", source_note: "RBI reference rate (seeded for demo)" },
  { currency: "INR", rate_to_inr: 1, as_of: "2026-09-25", source_note: "Base currency" },
];
