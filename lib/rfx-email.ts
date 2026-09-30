// Builds the (simulated) RFx invitation email for one vendor.
// Pure function: used by the seed script and by Publish in the co-pilot.

export interface InviteInput {
  rfx: { title: string; location: string | null; scope: string | null; terms: Record<string, unknown> };
  vendor: { name: string; contact_name: string | null };
  lines: { line_no: number; description: string; unit: string; annual_qty: number | null }[];
  questions: { q_no: number; text: string }[];
  buyerName: string;
}

const fmtQty = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-IN"));

export function buildInviteEmail(i: InviteInput): { subject: string; body: string } {
  const t = i.rfx.terms as Record<string, string | number | undefined>;
  const subject = `RFQ – ${i.rfx.title}`;
  const lines = i.lines
    .map((l) => `${String(l.line_no).padStart(2, " ")}. ${l.description} | Unit: ${l.unit} | Annual qty: ${fmtQty(l.annual_qty)}`)
    .join("\n");
  const qs = i.questions.map((q) => `Q${q.q_no}. ${q.text}`).join("\n");
  const termLines = [
    t.response_deadline && `Response deadline: ${t.response_deadline}`,
    t.validity_required_days && `Offer validity required: ${t.validity_required_days} days`,
    t.payment_terms && `Payment terms: ${t.payment_terms}`,
    t.delivery_terms && `Delivery: ${t.delivery_terms}`,
    t.freight_expectation && `Freight: ${t.freight_expectation}`,
    t.gst_treatment && `GST: ${t.gst_treatment}`,
    t.currency && `Currency: ${t.currency}`,
  ].filter(Boolean);

  const body = `Dear ${i.vendor.contact_name ?? i.vendor.name},

You are invited to quote for: ${i.rfx.title}
Delivery location: ${i.rfx.location ?? "—"}

Scope: ${i.rfx.scope ?? "—"}

LINE ITEMS
${lines}

QUESTIONNAIRE
${qs}

TERMS
${termLines.join("\n")}

Reply in any format that suits you: Excel, PDF, Word, a photo of your rate card, or a plain email. Please attach your ISO 9001 certificate and any test reports.

Regards,
${i.buyerName}`;
  return { subject, body };
}
