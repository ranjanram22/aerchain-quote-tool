import "server-only";
import { db } from "./supabase";
import type { RfxBundle, ExtractionRow } from "./types";
import { normalize, type Comparison, type NormalizeOptions } from "./normalize";

async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

// Loads everything the normalizer needs for one RFx, using only the latest
// (not superseded) response per vendor.
export async function loadBundle(rfxId: string): Promise<RfxBundle> {
  const s = db();
  const [rfx, lines, questions, invites, allResponses, fx, openItems] = await Promise.all([
    q(s.from("rfxs").select("*").eq("id", rfxId).single()),
    q(s.from("rfx_lines").select("*").eq("rfx_id", rfxId).order("line_no")),
    q(s.from("rfx_questions").select("*").eq("rfx_id", rfxId).order("q_no")),
    q(s.from("rfx_vendors").select("vendor_id, vendors(id,name,email,contact_name)").eq("rfx_id", rfxId)),
    q(s.from("responses").select("*").eq("rfx_id", rfxId).order("received_at", { ascending: false })),
    q(s.from("fx_rates").select("currency,rate_to_inr,as_of")),
    q(s.from("open_items").select("*").eq("rfx_id", rfxId)),
  ]);
  type Resp = RfxBundle["responses"][number] & { superseded_by: string | null };
  const responses = (allResponses as Resp[]).filter((r) => !r.superseded_by);
  const latest = new Map<string, Resp>();
  for (const r of responses) if (!latest.has(r.vendor_id)) latest.set(r.vendor_id, r);
  const respIds = [...latest.values()].map((r) => r.id);
  const vendors = (invites as unknown as { vendors: RfxBundle["vendors"][number] }[]).map((i) => i.vendors).sort((a, b) => a.name.localeCompare(b.name));
  const vendorIds = vendors.map((v) => v.id);

  const none = ["00000000-0000-0000-0000-000000000000"];
  const ids = respIds.length ? respIds : none;
  const [quoteLines, terms, extractions, answers, attachments, files, lastYear] = await Promise.all([
    q(s.from("quote_lines").select("*").in("response_id", ids)),
    q(s.from("commercial_terms").select("*").in("response_id", ids)),
    q(s.from("extractions").select("id,response_id,model,overall_confidence,created_at,raw_json").in("response_id", ids).order("created_at", { ascending: false })),
    q(s.from("questionnaire_answers").select("*").in("response_id", ids)),
    q(s.from("attachment_facts").select("*").in("response_id", ids)),
    q(s.from("response_files").select("*").in("response_id", ids)),
    q(s.from("last_year_prices").select("*").in("vendor_id", vendorIds.length ? vendorIds : none)),
  ]);

  const latestExt = new Map<string, ExtractionRow>();
  for (const e of extractions as (ExtractionRow & { raw_json: Record<string, unknown> })[]) {
    if (latestExt.has(e.response_id)) continue;
    const raw = e.raw_json ?? {};
    latestExt.set(e.response_id, {
      id: e.id, response_id: e.response_id, model: e.model, overall_confidence: e.overall_confidence, created_at: e.created_at,
      references: (raw.references as ExtractionRow["references"]) ?? [],
      notes: (raw.notes as string[]) ?? [],
      image_quality: (raw.image_quality as ExtractionRow["image_quality"]) ?? [],
    });
  }

  return {
    rfx: rfx as unknown as RfxBundle["rfx"],
    lines: lines as RfxBundle["lines"],
    questions: questions as RfxBundle["questions"],
    vendors,
    responses: [...latest.values()],
    quoteLines: quoteLines as RfxBundle["quoteLines"],
    terms: terms as RfxBundle["terms"],
    extractions: [...latestExt.values()],
    answers: answers as RfxBundle["answers"],
    attachments: attachments as RfxBundle["attachments"],
    files: files as RfxBundle["files"],
    fx: fx as RfxBundle["fx"],
    lastYear: lastYear as RfxBundle["lastYear"],
    openItems: openItems as RfxBundle["openItems"],
  };
}

export async function loadComparison(rfxId: string, opts: NormalizeOptions = {}): Promise<{ bundle: RfxBundle; cmp: Comparison }> {
  const bundle = await loadBundle(rfxId);
  return { bundle, cmp: normalize(bundle, opts) };
}

// Make the open_items table match what normalization derives:
// - new derived items are inserted (carrying over a previous buyer resolution
//   when the same underlying fact was already resolved on an older response);
// - open items that no longer apply are closed automatically.
export async function syncOpenItems(rfxId: string): Promise<{ inserted: number; closed: number }> {
  const { bundle, cmp } = await loadComparison(rfxId);
  const existing = new Map(bundle.openItems.filter((i) => i.key).map((i) => [i.key!, i]));
  const byFingerprint = new Map<string, (typeof bundle.openItems)[number]>();
  for (const i of bundle.openItems) {
    const fp = (i.details as { fingerprint?: string } | null)?.fingerprint;
    if (fp && i.status === "resolved") byFingerprint.set(fp, i);
  }
  const toInsert = cmp.openItems
    .filter((d) => !existing.has(d.key))
    .map((d) => {
      const prior = byFingerprint.get(String(d.details.fingerprint ?? ""));
      return {
        rfx_id: rfxId, key: d.key, kind: d.kind, vendor_id: d.vendor_id, response_id: d.response_id, rfx_line_id: d.rfx_line_id,
        quote_line_id: d.quote_line_id, message: d.message, details: d.details,
        ...(prior ? { status: "resolved", resolution: { ...prior.resolution, carried_over_from: prior.id }, resolved_by: prior.resolved_by, resolved_at: new Date().toISOString() } : {}),
      };
    });
  const derivedKeys = new Set(cmp.openItems.map((d) => d.key));
  const stale = bundle.openItems.filter((i) => i.status === "open" && i.key && !derivedKeys.has(i.key));
  if (toInsert.length) {
    const { error } = await db().from("open_items").insert(toInsert);
    if (error) throw new Error(`open_items insert: ${error.message}`);
  }
  if (stale.length) {
    await db().from("open_items").update({ status: "dismissed", resolution: { auto: "No longer applies after re-extraction or buyer input" }, resolved_by: "system", resolved_at: new Date().toISOString() }).in("id", stale.map((s) => s.id));
  }
  // Carried-over resolutions change the numbers; nothing else to do because
  // normalization reads resolutions from open_items directly.
  return { inserted: toInsert.length, closed: stale.length };
}
