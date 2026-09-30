"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/supabase";
import { syncOpenItems } from "@/lib/rfx-data";

const BUYER = "Ranjan (Buyer)";
export type Result = { ok: true } | { ok: false; error: string };

async function audit(rfxId: string, action: string, target: string, old_value: unknown, new_value: unknown, note: string | null) {
  await db().from("audit_log").insert({ rfx_id: rfxId, actor: BUYER, action, target, old_value, new_value, note });
}

// Buyer answers a ⚠ item (supplies a missing fact, confirms or rejects an interpretation).
export async function resolveOpenItem(rfxId: string, itemId: string, resolution: Record<string, unknown>, note: string | null): Promise<Result> {
  const { data: item } = await db().from("open_items").select("*").eq("id", itemId).single();
  if (!item) return { ok: false, error: "Item not found" };
  const { error } = await db()
    .from("open_items")
    .update({ status: "resolved", resolution: { ...resolution, note }, resolved_by: BUYER, resolved_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  await audit(rfxId, "open_item_resolved", `${item.kind}:${item.key}`, { status: item.status, message: item.message, resolution: item.resolution }, resolution, note);
  await syncOpenItems(rfxId);
  refresh();
  return { ok: true };
}

export async function dismissOpenItem(rfxId: string, itemId: string, note: string | null): Promise<Result> {
  const { data: item } = await db().from("open_items").select("*").eq("id", itemId).single();
  if (!item) return { ok: false, error: "Item not found" };
  const { error } = await db().from("open_items").update({ status: "dismissed", resolution: { note }, resolved_by: BUYER, resolved_at: new Date().toISOString() }).eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  await audit(rfxId, "open_item_dismissed", `${item.kind}:${item.key}`, { status: item.status, message: item.message }, { status: "dismissed" }, note);
  await syncOpenItems(rfxId);
  refresh();
  return { ok: true };
}

export async function reopenOpenItem(rfxId: string, itemId: string): Promise<Result> {
  const { data: item } = await db().from("open_items").select("*").eq("id", itemId).single();
  if (!item) return { ok: false, error: "Item not found" };
  await db().from("open_items").update({ status: "open", resolution: null, resolved_by: null, resolved_at: null }).eq("id", itemId);
  await audit(rfxId, "open_item_reopened", `${item.kind}:${item.key}`, { status: item.status, resolution: item.resolution }, { status: "open" }, null);
  await syncOpenItems(rfxId);
  refresh();
  return { ok: true };
}

// Buyer corrects an extracted value from the source drawer.
export async function editQuoteLine(
  rfxId: string,
  quoteLineId: string,
  patch: { price_value?: number | null; price_currency?: string; qty_basis?: string; basis_count?: number | null; pieces_per_pack?: number | null; weight_per_piece_kg?: number | null; price_unit_as_written?: string },
  note: string | null,
): Promise<Result> {
  const { data: old } = await db().from("quote_lines").select("*").eq("id", quoteLineId).single();
  if (!old) return { ok: false, error: "Line not found" };
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const { error } = await db().from("quote_lines").update({ ...clean, value_origin: "buyer_input", confidence: 1, match_confidence: 1 }).eq("id", quoteLineId);
  if (error) return { ok: false, error: error.message };
  const before = Object.fromEntries(Object.keys(clean).map((k) => [k, old[k]]));
  await audit(rfxId, "value_corrected", `quote_line:${quoteLineId} (line ${old.line_no})`, before, clean, note);
  await syncOpenItems(rfxId);
  refresh();
  return { ok: true };
}

export async function sendFollowup(rfxId: string, vendorId: string, toEmail: string | null, subject: string, body: string): Promise<Result> {
  if (!subject.trim() || !body.trim()) return { ok: false, error: "Subject and body are required." };
  const { error } = await db().from("outbox").insert({ rfx_id: rfxId, vendor_id: vendorId, kind: "followup", to_email: toEmail, subject, body });
  if (error) return { ok: false, error: error.message };
  await audit(rfxId, "followup_sent", `vendor:${vendorId}`, null, { subject }, "Simulated send");
  refresh();
  return { ok: true };
}
