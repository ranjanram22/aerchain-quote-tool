import { after } from "next/server";
import { db } from "@/lib/supabase";
import { runExtraction } from "@/lib/extract/run";

export const maxDuration = 300;

// Re-run extraction on an existing response (e.g. after a timeout).
export async function POST(_req: Request, ctx: RouteContext<"/api/responses/[rid]/retry">) {
  const { rid } = await ctx.params;
  const { data } = await db().from("responses").select("id,rfx_id").eq("id", rid).single();
  if (!data) return Response.json({ error: "Response not found" }, { status: 404 });
  await db().from("responses").update({ processing_status: "pending", error: null }).eq("id", rid);
  await db().from("audit_log").insert({ rfx_id: data.rfx_id, actor: "Ranjan (Buyer)", action: "extraction_retry", target: `response:${rid}` });
  const started = Date.now();
  after(() => runExtraction(rid, { deadlineMs: started + 290_000 }).then(() => undefined));
  return Response.json({ ok: true });
}
