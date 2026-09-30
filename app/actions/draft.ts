"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { db } from "@/lib/supabase";
import * as D from "@/lib/draft";

const BUYER = "Ranjan (Buyer)";
type R = { ok: true } | { ok: false; error: string };
const wrap = async (f: () => Promise<unknown>): Promise<R> => {
  try { await f(); refresh(); return { ok: true }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
};

export async function createDraft() {
  const { data, error } = await db().from("rfxs").insert({ title: "Untitled RFx", status: "draft", terms: {} }).select("id").single();
  if (error) throw new Error(error.message);
  await db().from("audit_log").insert({ rfx_id: data.id, actor: BUYER, action: "rfx_draft_created", target: "rfx" });
  redirect(`/rfx/${data.id}`);
}

export async function saveHeader(id: string, p: { title?: string; category?: string; location?: string; scope?: string }) { return wrap(() => D.setHeader(id, p)); }
export async function saveTerms(id: string, p: Record<string, unknown>) { return wrap(() => D.setTerms(id, p)); }
export async function addLine(id: string, p: D.DraftLineInput) { return wrap(() => D.addLines(id, [p])); }
export async function saveLine(id: string, lineNo: number, p: Partial<D.DraftLineInput>) { return wrap(() => D.updateLine(id, lineNo, p)); }
export async function deleteLine(id: string, lineNo: number) { return wrap(() => D.removeLine(id, lineNo)); }
export async function saveQuestions(id: string, qs: D.DraftQuestionInput[]) { return wrap(() => D.setQuestionnaire(id, qs)); }
export async function deleteDraft(id: string) {
  const d = await D.loadDraft(id);
  if (d.rfx.status !== "draft") return { ok: false, error: "Only drafts can be deleted." } as R;
  await db().from("rfxs").delete().eq("id", id);
  redirect("/");
}
export async function publishDraft(id: string, vendorIds: string[]): Promise<R> {
  try { await D.publish(id, vendorIds, BUYER); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  refresh();
  return { ok: true };
}
