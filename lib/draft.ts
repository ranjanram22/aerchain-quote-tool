import "server-only";
import { db } from "./supabase";
import { buildInviteEmail } from "./rfx-email";

// Operations on a draft RFx, shared by the co-pilot's tool calls and the
// buyer's direct edits in the draft pane.

export interface DraftLineInput {
  description: string;
  category?: string | null;
  unit?: string;
  annual_qty?: number | null;
  product_id?: string | null;
  spec?: Record<string, unknown>;
}
export interface DraftQuestionInput {
  text: string;
  code?: string | null;
  mandatory?: boolean;
  type?: "boolean" | "min" | "max" | "text";
  value?: number | null;
  unit?: string | null;
  evidence?: string | null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "q";

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function loadDraft(rfxId: string) {
  const [rfx, lines, questions] = await Promise.all([
    must(db().from("rfxs").select("*").eq("id", rfxId).single()),
    must(db().from("rfx_lines").select("*").eq("rfx_id", rfxId).order("line_no")),
    must(db().from("rfx_questions").select("*").eq("rfx_id", rfxId).order("q_no")),
  ]);
  return { rfx: rfx as unknown as Record<string, unknown> & { id: string; title: string; status: string; terms: Record<string, unknown> }, lines: lines as Record<string, unknown>[], questions: questions as Record<string, unknown>[] };
}
export type Draft = Awaited<ReturnType<typeof loadDraft>>;

async function assertDraft(rfxId: string) {
  const r = await must(db().from("rfxs").select("status").eq("id", rfxId).single()) as { status: string };
  if (r.status !== "draft") throw new Error("This RFx has been published and can no longer be edited.");
}

export async function setHeader(rfxId: string, p: { title?: string; category?: string; location?: string; scope?: string }) {
  await assertDraft(rfxId);
  const patch = Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
  if (Object.keys(patch).length) await must(db().from("rfxs").update(patch).eq("id", rfxId));
  return `Header updated: ${Object.keys(patch).join(", ") || "nothing"}`;
}

export async function setTerms(rfxId: string, p: Record<string, unknown>) {
  await assertDraft(rfxId);
  const { terms } = (await must(db().from("rfxs").select("terms").eq("id", rfxId).single())) as { terms: Record<string, unknown> };
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  await must(db().from("rfxs").update({ terms: { ...(terms ?? {}), ...clean } }).eq("id", rfxId));
  return `Terms updated: ${Object.keys(clean).join(", ")}`;
}

export async function addLines(rfxId: string, items: DraftLineInput[]) {
  await assertDraft(rfxId);
  const existing = (await must(db().from("rfx_lines").select("line_no").eq("rfx_id", rfxId))) as { line_no: number }[];
  let n = existing.reduce((m, l) => Math.max(m, l.line_no), 0);
  const rows = items.filter((i) => i.description?.trim()).map((i) => {
    n++;
    return {
      rfx_id: rfxId, line_no: n, line_key: `L${String(n).padStart(2, "0")}`, description: i.description.trim(), category: i.category ?? null,
      unit: (i.unit ?? "piece").toLowerCase().replace(/^pcs?$|^nos?$|^each$/, "piece"), annual_qty: i.annual_qty ?? null, product_id: i.product_id ?? null, spec: i.spec ?? {},
    };
  });
  if (rows.length) await must(db().from("rfx_lines").insert(rows));
  return `Added ${rows.length} line(s): ${rows.map((r) => r.line_no).join(", ")}`;
}

export async function updateLine(rfxId: string, lineNo: number, p: Partial<DraftLineInput>) {
  await assertDraft(rfxId);
  const patch: Record<string, unknown> = {};
  if (p.description) patch.description = p.description;
  if (p.category !== undefined) patch.category = p.category;
  if (p.unit) patch.unit = p.unit;
  if (p.annual_qty !== undefined) patch.annual_qty = p.annual_qty;
  if (p.product_id !== undefined) patch.product_id = p.product_id;
  if (p.spec) {
    const cur = (await must(db().from("rfx_lines").select("spec").eq("rfx_id", rfxId).eq("line_no", lineNo).single())) as { spec: Record<string, unknown> };
    patch.spec = { ...(cur.spec ?? {}), ...p.spec };
  }
  await must(db().from("rfx_lines").update(patch).eq("rfx_id", rfxId).eq("line_no", lineNo));
  return `Line ${lineNo} updated`;
}

export async function removeLine(rfxId: string, lineNo: number) {
  await assertDraft(rfxId);
  await must(db().from("rfx_lines").delete().eq("rfx_id", rfxId).eq("line_no", lineNo));
  const rest = (await must(db().from("rfx_lines").select("id,line_no").eq("rfx_id", rfxId).gt("line_no", lineNo).order("line_no"))) as { id: string; line_no: number }[];
  for (const r of rest) await must(db().from("rfx_lines").update({ line_no: r.line_no - 1, line_key: `L${String(r.line_no - 1).padStart(2, "0")}` }).eq("id", r.id));
  return `Line ${lineNo} removed; later lines renumbered`;
}

export async function setQuestionnaire(rfxId: string, qs: DraftQuestionInput[]) {
  await assertDraft(rfxId);
  await must(db().from("rfx_questions").delete().eq("rfx_id", rfxId));
  const rows = qs.filter((q) => q.text?.trim()).map((q, i) => ({
    rfx_id: rfxId, q_no: i + 1, code: q.code ? slug(q.code) : slug(q.text.split(/\s+/).slice(0, 4).join(" ")), text: q.text.trim(),
    requirement: { type: q.type ?? "text", mandatory: !!q.mandatory, ...(q.value != null ? { value: q.value } : {}), ...(q.unit ? { unit: q.unit } : {}), ...(q.evidence ? { evidence: q.evidence } : {}) },
    weight: q.mandatory ? 3 : 1,
  }));
  if (rows.length) await must(db().from("rfx_questions").insert(rows));
  return `Questionnaire set: ${rows.length} question(s)`;
}

export async function searchCatalog(query: string) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const all = (await must(db().from("products").select("*").order("name"))) as Record<string, unknown>[];
  const scored = all
    .map((p) => {
      const hay = `${p.name} ${p.type} ${p.ply}ply ${p.ply}-ply ${p.flute} ${p.gsm} ${p.length_mm}x${p.width_mm}x${p.height_mm} ${p.print} ${p.notes}`.toLowerCase();
      return { p, score: words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  return scored.map(({ p }) => ({
    product_id: p.id, name: p.name, type: p.type, ply: p.ply, flute: p.flute, paper_gsm: p.gsm, bf: p.bf,
    dimensions_mm: [p.length_mm, p.width_mm, p.height_mm].filter((x) => x != null).join(" x "), print: p.print, base_unit: p.base_unit, notes: p.notes,
  }));
}

export async function publish(rfxId: string, vendorIds: string[], buyerName: string) {
  const d = await loadDraft(rfxId);
  if (d.rfx.status !== "draft") throw new Error("Already published.");
  if (!d.lines.length) throw new Error("Add at least one line item before publishing.");
  if (!vendorIds.length) throw new Error("Choose at least one vendor.");
  const vendors = (await must(db().from("vendors").select("id,name,contact_name,email").in("id", vendorIds))) as { id: string; name: string; contact_name: string | null; email: string | null }[];
  const now = new Date().toISOString();
  await must(db().from("rfx_vendors").insert(vendors.map((v) => ({ rfx_id: rfxId, vendor_id: v.id, invited_at: now, status: "invited" }))));
  const lines = d.lines.map((l) => ({ line_no: l.line_no as number, description: l.description as string, unit: l.unit as string, annual_qty: (l.annual_qty as number) ?? null }));
  const questions = d.questions.map((q) => ({ q_no: q.q_no as number, text: q.text as string }));
  await must(db().from("outbox").insert(vendors.map((v) => {
    const { subject, body } = buildInviteEmail({ rfx: { title: d.rfx.title, location: (d.rfx.location as string) ?? null, scope: (d.rfx.scope as string) ?? null, terms: d.rfx.terms ?? {} }, vendor: v, lines, questions, buyerName });
    return { rfx_id: rfxId, vendor_id: v.id, kind: "invite", to_email: v.email, subject, body, sent_at: now };
  })));
  await must(db().from("rfxs").update({ status: "sent", rfx_date: now.slice(0, 10) }).eq("id", rfxId));
  await db().from("audit_log").insert({ rfx_id: rfxId, actor: buyerName, action: "rfx_published", target: "rfx", new_value: { vendors: vendors.map((v) => v.name), lines: lines.length, questions: questions.length }, note: "Simulated send" });
  return vendors.length;
}
