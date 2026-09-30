import { loadComparison } from "@/lib/rfx-data";
import { draftFollowup } from "@/lib/followup";

export const maxDuration = 90;

// POST { vendor_id } → drafted follow-up email built from that vendor's gap list.
export async function POST(req: Request, ctx: RouteContext<"/api/rfx/[id]/followup">) {
  const { id } = await ctx.params;
  const { vendor_id } = await req.json();
  if (!vendor_id) return Response.json({ error: "vendor_id required" }, { status: 400 });
  try {
    const { bundle, cmp } = await loadComparison(id);
    const draft = await draftFollowup(bundle, cmp, vendor_id, "Ranjan (Buyer)");
    return Response.json(draft);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
