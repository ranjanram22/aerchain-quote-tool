import "server-only";
import { createHash } from "node:crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { db, STORAGE_BUCKET } from "../supabase";
import { chat, textOf, type StatusFn } from "../llm";
import { MODELS, displayModel } from "../models";
import { syncOpenItems } from "../rfx-data";
import { Extraction, type ExtractionT } from "./schema";
import { EXTRACTION_SYSTEM, rfxBrief, type RfxContext } from "./prompt";
import { toContentParts, kindOf, type InputFile } from "./preprocess";

// Bump when the extraction contract changes so old cache entries are ignored.
const CACHE_VERSION = "v1";

function parseJson(text: string): unknown {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("No JSON object in model output");
  return JSON.parse(t.slice(a, b + 1));
}

interface Attempt { model: string; ok: boolean; error?: string; latency_ms: number; overall_confidence?: number; cached?: boolean }

// One model: first try, then one repair round with the validation errors.
async function callModel(model: string, messages: ChatCompletionMessageParam[], attempts: Attempt[], onStatus?: StatusFn): Promise<{ data: ExtractionT; model: string } | null> {
  const started = Date.now();
  const req = { max_tokens: 60000, temperature: 0, response_format: { type: "json_object" as const } };
  let r;
  try {
    r = await chat("extraction", { messages, ...req }, { models: [model], onStatus });
  } catch (e) {
    attempts.push({ model, ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e), latency_ms: Date.now() - started });
    return null;
  }
  const raw = textOf(r);
  let err = "";
  try {
    const parsed = Extraction.safeParse(parseJson(raw));
    if (parsed.success) {
      attempts.push({ model, ok: true, latency_ms: Date.now() - started, overall_confidence: parsed.data.overall_confidence });
      return { data: parsed.data, model };
    }
    err = parsed.error.issues.slice(0, 15).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  attempts.push({ model, ok: false, error: `Invalid output: ${err.slice(0, 400)}`, latency_ms: Date.now() - started });
  const repairStart = Date.now();
  try {
    const r2 = await chat("extraction", {
      messages: [...messages, { role: "assistant", content: raw.slice(0, 60000) }, { role: "user", content: `Your output failed validation: ${err}\nReturn the complete corrected JSON object only.` }],
      ...req,
    }, { models: [model], onStatus });
    const parsed2 = Extraction.safeParse(parseJson(textOf(r2)));
    if (parsed2.success) {
      attempts.push({ model, ok: true, latency_ms: Date.now() - repairStart, overall_confidence: parsed2.data.overall_confidence });
      return { data: parsed2.data, model };
    }
    attempts.push({ model, ok: false, error: `Repair invalid: ${parsed2.error.issues.slice(0, 5).map((i) => i.path.join(".") + " " + i.message).join("; ")}`, latency_ms: Date.now() - repairStart });
  } catch (e) {
    attempts.push({ model, ok: false, error: `Repair failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`, latency_ms: Date.now() - repairStart });
  }
  return null;
}

// ---- cache: identical inputs never call a model twice ----
function cacheKey(brief: string, files: InputFile[], email: string | null) {
  const h = createHash("sha256");
  h.update(JSON.stringify({ v: CACHE_VERSION, sys: EXTRACTION_SYSTEM, brief, email: email?.trim() ?? "", chain: MODELS.extraction.chain }));
  for (const f of [...files].sort((a, b) => a.filename.localeCompare(b.filename))) {
    h.update(f.filename);
    h.update(createHash("sha256").update(f.data).digest("hex"));
  }
  return h.digest("hex");
}
const cachePath = (key: string) => `cache/extraction/${key}.json`;

async function readCache(key: string): Promise<{ data: ExtractionT; model: string } | null> {
  const { data } = await db().storage.from(STORAGE_BUCKET).download(cachePath(key));
  if (!data) return null;
  try {
    const j = JSON.parse(await data.text());
    const parsed = Extraction.safeParse(j.data);
    return parsed.success ? { data: parsed.data, model: j.model } : null;
  } catch {
    return null;
  }
}
async function writeCache(key: string, v: { data: ExtractionT; model: string }) {
  await db().storage.from(STORAGE_BUCKET).upload(cachePath(key), JSON.stringify({ ...v, cached_at: new Date().toISOString() }), { contentType: "application/json", upsert: true });
}

export interface RunResult { ok: boolean; model?: string; lines?: number; confidence?: number; error?: string; cached?: boolean; attempts: Attempt[] }

export async function runExtraction(responseId: string, opts: { deadlineMs?: number; noCache?: boolean } = {}): Promise<RunResult> {
  const s = db();
  const attempts: Attempt[] = [];
  const { data: resp, error: rErr } = await s.from("responses").select("*").eq("id", responseId).single();
  if (rErr || !resp) return { ok: false, error: rErr?.message ?? "Response not found", attempts };
  await s.from("responses").update({ processing_status: "processing", error: null }).eq("id", responseId);
  await s.from("response_files").update({ processing_status: "processing", error: null }).eq("response_id", responseId);
  // Shown in the Responses tab while reading (e.g. "AI busy, retrying in 6s").
  const onStatus: StatusFn = (m) => { void s.from("responses").update({ error: m }).eq("id", responseId).eq("processing_status", "processing"); };

  try {
    const [{ data: rfx }, { data: lines }, { data: questions }, { data: fileRows }] = await Promise.all([
      s.from("rfxs").select("*").eq("id", resp.rfx_id).single(),
      s.from("rfx_lines").select("id,line_no,description,unit,annual_qty,spec").eq("rfx_id", resp.rfx_id).order("line_no"),
      s.from("rfx_questions").select("id,q_no,text").eq("rfx_id", resp.rfx_id).order("q_no"),
      s.from("response_files").select("*").eq("response_id", responseId).order("created_at"),
    ]);
    if (!rfx || !lines || !questions) throw new Error("RFx not found");

    const files: InputFile[] = [];
    for (const f of fileRows ?? []) {
      const { data, error } = await s.storage.from(STORAGE_BUCKET).download(f.storage_path);
      if (error || !data) {
        await s.from("response_files").update({ processing_status: "error", error: `Download failed: ${error?.message}` }).eq("id", f.id);
        continue;
      }
      files.push({ id: f.id, filename: f.filename, mime: f.mime, data: Buffer.from(await data.arrayBuffer()) });
    }
    const ctx: RfxContext = { title: rfx.title, rfx_date: rfx.rfx_date, currency_note: null, lines, questions, terms: rfx.terms ?? {} };
    const brief = rfxBrief(ctx);
    const { parts, problems } = await toContentParts(files, resp.raw_email_text);
    if (!parts.length) throw new Error("Nothing to read: no files and no email text.");

    const key = cacheKey(brief, files, resp.raw_email_text);
    let result = opts.noCache ? null : await readCache(key);
    const cached = !!result;
    if (result) attempts.push({ model: result.model, ok: true, latency_ms: 0, overall_confidence: result.data.overall_confidence, cached: true });
    else {
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: EXTRACTION_SYSTEM },
        { role: "user", content: [{ type: "text", text: brief }, ...parts, { type: "text", text: "Now return the JSON object." }] },
      ];
      // Walk the free-model chain until one returns a valid reading. Low
      // confidence does NOT trigger a re-run: values are kept and flagged ⚠.
      for (const model of MODELS.extraction.chain) {
        if (opts.deadlineMs && opts.deadlineMs - Date.now() < 60_000) break;
        result = await callModel(model, messages, attempts, onStatus);
        if (result) break;
        onStatus(`Could not get a valid reading from ${displayModel(model)}; trying the backup model…`);
      }
      if (!result) throw new Error("The AI could not produce a valid reading of this response. " + (attempts.at(-1)?.error ?? ""));
      await writeCache(key, result);
    }

    await persist(responseId, rfx.rfx_date, result.data, result.model, lines, questions, fileRows ?? [], attempts, problems);
    await s.from("responses").update({ processing_status: "done", error: problems.length ? problems.join("; ") : null }).eq("id", responseId);
    for (const f of fileRows ?? []) {
      const p = problems.find((x) => x.startsWith(f.filename + ":"));
      await s.from("response_files").update({ processing_status: p ? "error" : "done", error: p ?? null }).eq("id", f.id);
    }
    await s.from("rfxs").update({ status: "evaluating" }).eq("id", resp.rfx_id).in("status", ["sent", "collecting"]);
    await syncOpenItems(resp.rfx_id);
    return { ok: true, model: result.model, lines: result.data.line_quotes.length, confidence: result.data.overall_confidence, cached, attempts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await s.from("responses").update({ processing_status: "error", error: msg.slice(0, 1000) }).eq("id", responseId);
    await s.from("response_files").update({ processing_status: "error", error: msg.slice(0, 300) }).eq("response_id", responseId).eq("processing_status", "processing");
    await s.from("audit_log").insert({ rfx_id: resp.rfx_id, actor: "system", action: "extraction_failed", target: `response:${responseId}`, new_value: { error: msg.slice(0, 500), attempts } });
    return { ok: false, error: msg, attempts };
  }
}

async function persist(
  responseId: string,
  rfxDate: string,
  x: ExtractionT,
  model: string,
  lines: { id: string; line_no: number }[],
  questions: { id: string; q_no: number }[],
  fileRows: { id: string; filename: string; kind: string }[],
  attempts: Attempt[],
  problems: string[],
) {
  const s = db();
  const fileId = (name: string) => fileRows.find((f) => f.filename === name)?.id ?? null;
  const withFileId = <T extends { file: string }>(p: T) => ({ ...p, file_id: fileId(p.file) });

  // Clear any previous rows for this response (re-run on the same response).
  await Promise.all([
    s.from("quote_lines").delete().eq("response_id", responseId),
    s.from("commercial_terms").delete().eq("response_id", responseId),
    s.from("questionnaire_answers").delete().eq("response_id", responseId),
    s.from("attachment_facts").delete().eq("response_id", responseId),
  ]);

  const { data: ext, error: eErr } = await s
    .from("extractions")
    .insert({ response_id: responseId, model, raw_json: x, overall_confidence: x.overall_confidence, notes: [...x.notes, ...problems], attempts, latency_ms: attempts.reduce((a, b) => a + b.latency_ms, 0) })
    .select("id")
    .single();
  if (eErr) throw new Error(`save extraction: ${eErr.message}`);

  const lineId = (n: number | null) => (n == null ? null : (lines.find((l) => l.line_no === n)?.id ?? null));
  const qlRows = x.line_quotes.map((l) => ({
    response_id: responseId,
    extraction_id: ext.id,
    line_no: l.rfx_line_no,
    vendor_line_text: l.vendor_line_text,
    matched_rfx_line_id: lineId(l.rfx_line_no),
    match_confidence: l.match_confidence,
    match_reason: l.match_reason,
    price_value: l.price_value,
    price_currency: l.currency ? l.currency.toUpperCase() : null,
    price_unit_as_written: l.price_unit_as_written,
    qty_basis: l.price_basis,
    basis_count: l.basis_count,
    basis_item: l.basis_item,
    pieces_per_pack: l.pieces_per_pack,
    weight_per_piece_kg: l.weight_per_piece_kg,
    offered_spec: l.offered_spec,
    deviation: l.deviation.length ? l.deviation : null,
    provenance: withFileId(l.provenance),
    confidence: l.confidence,
    value_origin: l.origin,
  }));
  if (qlRows.length) {
    const { error } = await s.from("quote_lines").insert(qlRows);
    if (error) throw new Error(`save quote lines: ${error.message}`);
  }

  const t = x.commercial_terms;
  const fp = <T extends { provenance: { file: string } } | null>(v: T) => (v ? { ...v, provenance: withFileId(v.provenance) } : null);
  await s.from("commercial_terms").insert({
    response_id: responseId,
    freight: { ...t.freight, provenance: t.freight.provenance ? withFileId(t.freight.provenance) : null },
    discounts: t.discounts.map((d) => ({ ...d, provenance: withFileId(d.provenance) })),
    gst: fp(t.gst),
    payment_terms: fp(t.payment_terms),
    validity: fp(t.validity),
    lead_time: fp(t.lead_time),
    incoterm: fp(t.incoterm),
    other: t.other.map((o) => ({ ...o, provenance: withFileId(o.provenance) })),
  });

  const qaRows = x.questionnaire_answers
    .map((a) => {
      const q = questions.find((qq) => qq.q_no === a.q_no);
      if (!q) return null;
      return {
        response_id: responseId,
        question_id: q.id,
        answer_text: a.answer_text,
        normalized: { value_bool: a.value_bool, value_number: a.value_number, value_unit: a.value_unit, confidence: a.confidence },
        status: "unknown",
        provenance: withFileId(a.provenance),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (qaRows.length) await s.from("questionnaire_answers").insert(qaRows);

  const facts = x.attachments
    .filter((a) => a.certificate)
    .map((a) => {
      const c = a.certificate!;
      return {
        response_id: responseId,
        response_file_id: fileId(a.file),
        fact_type: c.fact_type,
        issuer: c.issuer,
        cert_no: c.cert_no,
        valid_until: /^\d{4}-\d{2}-\d{2}$/.test(c.valid_until ?? "") ? c.valid_until : null,
        is_valid_on_rfx_date: c.valid_until ? c.valid_until >= rfxDate : null,
        details: { standard: c.standard, holder: c.holder, issued_on: c.issued_on, summary: a.summary },
        provenance: withFileId(a.provenance),
      };
    });
  if (facts.length) await s.from("attachment_facts").insert(facts);
  for (const a of x.attachments) {
    const id = fileId(a.file);
    if (id) await s.from("response_files").update({ kind: a.type }).eq("id", id);
  }
  await s.from("audit_log").insert({
    rfx_id: (await s.from("responses").select("rfx_id").eq("id", responseId).single()).data?.rfx_id,
    actor: "system",
    action: "extraction_run",
    target: `response:${responseId}`,
    new_value: { model, lines: x.line_quotes.length, overall_confidence: x.overall_confidence, attempts: attempts.length, cached: attempts.some((a) => a.cached) },
  });
}

// Creates a response, uploads files to storage. Used by seed and the upload API.
export async function createResponse(input: {
  rfxId: string;
  vendorId: string;
  emailText: string | null;
  files: { filename: string; mime: string | null; data: Buffer }[];
  receivedAt?: string;
}): Promise<string> {
  const s = db();
  const { data: prev } = await s.from("responses").select("id,version").eq("rfx_id", input.rfxId).eq("vendor_id", input.vendorId).is("superseded_by", null).order("received_at", { ascending: false }).limit(1);
  const version = (prev?.[0]?.version ?? 0) + 1;
  const { data: resp, error } = await s
    .from("responses")
    .insert({ rfx_id: input.rfxId, vendor_id: input.vendorId, raw_email_text: input.emailText, version, received_at: input.receivedAt ?? new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(`create response: ${error.message}`);
  if (prev?.[0]) await s.from("responses").update({ superseded_by: resp.id }).eq("id", prev[0].id);
  for (const f of input.files) {
    const safe = f.filename.replace(/[^A-Za-z0-9._-]+/g, "_");
    const path = `${input.rfxId}/${resp.id}/${Date.now()}_${safe}`;
    const mime = f.mime ?? guessMime(f.filename);
    const up = await s.storage.from(STORAGE_BUCKET).upload(path, f.data, { contentType: mime, upsert: false });
    if (up.error) throw new Error(`upload ${f.filename}: ${up.error.message}`);
    const k = kindOf(f.filename, mime);
    await s.from("response_files").insert({ response_id: resp.id, storage_path: path, filename: f.filename, mime, kind: k === "unsupported" ? "other" : "quote" });
  }
  await s.from("rfx_vendors").update({ status: "replied" }).eq("rfx_id", input.rfxId).eq("vendor_id", input.vendorId);
  return resp.id;
}

export function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  return (
    {
      pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      heic: "image/heic", txt: "text/plain", eml: "message/rfc822", webp: "image/webp",
    } as Record<string, string>
  )[ext ?? ""] ?? "application/octet-stream";
}
