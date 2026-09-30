import "server-only";
import type { Comparison } from "./normalize";
import type { RfxBundle } from "./types";
import { chat, textOf } from "./llm";

// Structured gap list for one vendor, built deterministically from the
// normalized comparison. The LLM only turns this list into polite prose.
export interface Gap {
  kind: string;
  lines?: number[];
  what: string;
}

export function buildGaps(b: RfxBundle, cmp: Comparison, vendorId: string): Gap[] {
  const gaps: Gap[] = [];
  const items = cmp.openItems.filter((o) => o.vendor_id === vendorId);
  const resolvedKeys = new Set(b.openItems.filter((o) => o.status !== "open").map((o) => o.key));
  for (const o of items) {
    if (resolvedKeys.has(o.key)) continue;
    const d = o.details as Record<string, unknown>;
    switch (o.kind) {
      case "missing_line":
        gaps.push({ kind: "missing_lines", lines: d.line_nos as number[], what: "No price given for these RFx lines. Please quote them or confirm you will not supply them." });
        break;
      case "pieces_per_pack":
        gaps.push({ kind: "pack_size", lines: [d.line_no as number], what: `Price is "${d.raw_unit}". Please state how many pieces/sets are in one pack/bundle.` });
        break;
      case "weight_per_piece":
        gaps.push({ kind: "weight", lines: [d.line_no as number], what: `Price is per kg. Please state the weight of one piece (kg) or quote per piece.` });
        break;
      case "freight_amount":
        gaps.push({ kind: "freight", what: "Freight is extra but no amount is given. Please state the freight amount and basis (per shipment, per kg, or % of value), or confirm door delivery to our plant is included." });
        break;
      case "unanswered_question":
        gaps.push({ kind: "questionnaire", what: `Please answer questionnaire items ${(d.q_nos as number[]).map((n) => `Q${n}`).join(", ")}: ${(d.q_nos as number[]).map((n) => b.questions.find((q) => q.q_no === n)?.text).filter(Boolean).join(" | ")}` });
        break;
      case "expired_cert":
        gaps.push({ kind: "certificate", what: `The ${d.fact_type} certificate provided expired on ${d.valid_until}. Please send the current, valid certificate.` });
        break;
      case "confirm_interpretation": {
        const sub = d.subkind as string;
        if (sub === "deviation") gaps.push({ kind: "spec_deviation", lines: [d.line_no as number], what: `Offered spec differs from the RFx: ${(d.deviation as { field: string; requested: string; offered: string }[]).map((x) => `${x.field} ${x.offered} vs ${x.requested} requested`).join("; ")}. Please confirm whether you can supply to the RFx spec and at what price.` });
        else if (sub === "group_statement") gaps.push({ kind: "scope", lines: d.line_nos as number[], what: `You wrote "${d.snippet}". Please confirm which line items this price applies to, and give a price per piece for each.` });
        else if (sub === "reference_unresolved") gaps.push({ kind: "reference", lines: [d.line_no as number], what: `You wrote "${d.phrase}", but we have no earlier price on record for this line. Please state the price.` });
        else if (sub === "reference") gaps.push({ kind: "reference", lines: d.line_nos as number[], what: `You wrote "${d.phrase}". Please confirm the prices for these lines explicitly.` });
        else if (sub === "questionnaire") gaps.push({ kind: "questionnaire", what: `Your answer to Q${d.q_no} is incomplete ("${d.answer_text ?? ""}"). Please confirm fully.` });
        else if (sub === "low_confidence") gaps.push({ kind: "unclear", lines: [d.line_no as number], what: `We could not read the price for this line with certainty ("${d.snippet ?? ""}"). Please confirm it.` });
        break;
      }
      case "price_check":
        gaps.push({ kind: "price_check", lines: [d.line_no as number], what: "This price is far from other quotes for the same item. Please confirm the price and its unit." });
        break;
    }
  }
  return gaps;
}

const SYSTEM = `You write short, polite, specific follow-up emails from a buyer to a supplier who replied to a request for quotation.
Use ONLY the gaps provided. Do not add requests, prices, dates or promises that are not in the input. Refer to RFx line numbers exactly as given. Group related points. Plain text, no markdown. Keep it under 250 words. Sign off with the buyer's name.
Return JSON: {"subject": string, "body": string}`;

export async function draftFollowup(b: RfxBundle, cmp: Comparison, vendorId: string, buyerName: string): Promise<{ subject: string; body: string; gaps: Gap[]; model: string | null }> {
  const vendor = b.vendors.find((v) => v.id === vendorId);
  if (!vendor) throw new Error("Vendor not invited to this RFx");
  const gaps = buildGaps(b, cmp, vendorId);
  if (!gaps.length) return { subject: "", body: "", gaps, model: null };
  const lineText = (n: number) => b.lines.find((l) => l.line_no === n)?.description ?? "";
  const input = {
    rfx_title: b.rfx.title,
    supplier: vendor.name,
    contact: vendor.contact_name,
    buyer: buyerName,
    deadline: (b.rfx.terms as Record<string, unknown>).response_deadline ?? null,
    gaps: gaps.map((g) => ({ ...g, line_details: g.lines?.map((n) => `Line ${n}: ${lineText(n)}`) })),
  };
  const r = await chat("followup", { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(input) }], max_tokens: 2500, temperature: 0.2 });
  const txt = textOf(r);
  try {
    const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    if (typeof j.subject === "string" && typeof j.body === "string") return { subject: j.subject, body: j.body, gaps, model: r.model };
  } catch {
    /* fall through to template */
  }
  // Deterministic fallback so the buyer always gets a usable draft.
  const body = `Dear ${vendor.contact_name ?? vendor.name},\n\nThank you for your quotation for ${b.rfx.title}. To complete our evaluation, please help with the following:\n\n${gaps
    .map((g, i) => `${i + 1}. ${g.lines?.length ? `Line(s) ${g.lines.join(", ")}: ` : ""}${g.what}`)
    .join("\n")}\n\nRegards,\n${buyerName}`;
  return { subject: `Clarifications needed – ${b.rfx.title}`, body, gaps, model: null };
}
