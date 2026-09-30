import { after } from "next/server";
import { createResponse, runExtraction } from "@/lib/extract/run";

export const maxDuration = 300;

// POST multipart: vendor_id, email_text (optional), files[] (optional).
// Stores the reply, returns its id immediately, and runs extraction in the
// background; the client polls the response's processing_status.
export async function POST(req: Request, ctx: RouteContext<"/api/rfx/[id]/responses">) {
  const { id } = await ctx.params;
  const form = await req.formData();
  const vendorId = String(form.get("vendor_id") ?? "");
  const emailText = String(form.get("email_text") ?? "").trim() || null;
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (!vendorId) return Response.json({ error: "Choose the vendor this reply is from." }, { status: 400 });
  if (!emailText && !files.length) return Response.json({ error: "Add at least one file or paste the email text." }, { status: 400 });
  const tooBig = files.find((f) => f.size > 20 * 1024 * 1024);
  if (tooBig) return Response.json({ error: `${tooBig.name} is larger than 20 MB.` }, { status: 400 });
  try {
    const responseId = await createResponse({
      rfxId: id,
      vendorId,
      emailText,
      files: await Promise.all(files.map(async (f) => ({ filename: f.name, mime: f.type || null, data: Buffer.from(await f.arrayBuffer()) }))),
    });
    const started = Date.now();
    after(() => runExtraction(responseId, { deadlineMs: started + 290_000 }).then(() => undefined));
    return Response.json({ response_id: responseId });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
