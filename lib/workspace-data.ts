import "server-only";
import { db, STORAGE_BUCKET } from "./supabase";
import { loadComparison } from "./rfx-data";
import type { RfxBundle } from "./types";
import type { Comparison } from "./normalize";

export interface OutboxRow { id: string; vendor_id: string | null; kind: string; to_email: string | null; subject: string; body: string; sent_at: string }
export interface AuditRow { id: string; actor: string; action: string; target: string | null; old_value: unknown; new_value: unknown; note: string | null; at: string }
export interface ExtractionMeta { id: string; response_id: string; model: string; overall_confidence: number | null; created_at: string; latency_ms: number | null; attempts: { model: string; ok: boolean; error?: string; latency_ms: number }[]; notes: string[] }
export interface ResponseHistory { id: string; vendor_id: string; version: number; received_at: string; processing_status: string; superseded_by: string | null }

export interface WorkspaceData {
  bundle: RfxBundle;
  cmp: Comparison;
  fileUrls: Record<string, string>; // file id → signed URL (1 h)
  outbox: OutboxRow[];
  audit: AuditRow[];
  extractionMeta: ExtractionMeta[];
  history: ResponseHistory[];
  vendorEmails: Record<string, string | null>;
  otherVendors: { id: string; name: string }[];
}

export async function loadWorkspace(rfxId: string): Promise<WorkspaceData> {
  const { bundle, cmp } = await loadComparison(rfxId);
  const respIds = bundle.responses.map((r) => r.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [outbox, audit, ext, history, signed] = await Promise.all([
    db().from("outbox").select("*").eq("rfx_id", rfxId).order("sent_at", { ascending: false }),
    db().from("audit_log").select("*").eq("rfx_id", rfxId).order("at", { ascending: false }).limit(300),
    db().from("extractions").select("id,response_id,model,overall_confidence,created_at,latency_ms,attempts,notes").in("response_id", respIds.length ? respIds : none).order("created_at", { ascending: false }),
    db().from("responses").select("id,vendor_id,version,received_at,processing_status,superseded_by").eq("rfx_id", rfxId).order("received_at", { ascending: false }),
    bundle.files.length ? db().storage.from(STORAGE_BUCKET).createSignedUrls(bundle.files.map((f) => f.storage_path), 3600) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);
  const fileUrls: Record<string, string> = {};
  for (const f of bundle.files) {
    const s = (signed.data ?? []).find((x) => x.path === f.storage_path);
    if (s?.signedUrl) fileUrls[f.id] = s.signedUrl;
  }
  const latestExt = new Map<string, ExtractionMeta>();
  for (const e of (ext.data ?? []) as ExtractionMeta[]) if (!latestExt.has(e.response_id)) latestExt.set(e.response_id, e);
  const { data: vendors } = await db().from("vendors").select("id,email").in("id", bundle.vendors.map((v) => v.id).concat(none));
  const { data: all } = await db().from("vendors").select("id,name").order("name");
  const invited = new Set(bundle.vendors.map((v) => v.id));
  return {
    bundle,
    cmp,
    fileUrls,
    outbox: (outbox.data ?? []) as OutboxRow[],
    audit: (audit.data ?? []) as AuditRow[],
    extractionMeta: [...latestExt.values()],
    history: (history.data ?? []) as ResponseHistory[],
    vendorEmails: Object.fromEntries((vendors ?? []).map((v) => [v.id, v.email])),
    otherVendors: (all ?? []).filter((v) => !invited.has(v.id)),
  };
}
