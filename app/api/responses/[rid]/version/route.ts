import { db, STORAGE_BUCKET } from "@/lib/supabase";

// Read-only view of one (possibly superseded) response version: files, the
// values read from it, and the extraction that produced them.
export async function GET(_req: Request, ctx: RouteContext<"/api/responses/[rid]/version">) {
  const { rid } = await ctx.params;
  const s = db();
  const { data: resp } = await s.from("responses").select("id,vendor_id,version,received_at,processing_status,raw_email_text,superseded_by,error").eq("id", rid).single();
  if (!resp) return Response.json({ error: "Not found" }, { status: 404 });
  const [{ data: files }, { data: lines }, { data: ext }, { data: terms }] = await Promise.all([
    s.from("response_files").select("id,filename,kind,storage_path").eq("response_id", rid),
    s.from("quote_lines").select("line_no,vendor_line_text,price_value,price_currency,price_unit_as_written,value_origin,confidence").eq("response_id", rid).order("line_no"),
    s.from("extractions").select("model,overall_confidence,created_at,notes").eq("response_id", rid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    s.from("commercial_terms").select("freight,discounts,payment_terms,validity").eq("response_id", rid).maybeSingle(),
  ]);
  const signed = files?.length ? (await s.storage.from(STORAGE_BUCKET).createSignedUrls(files.map((f) => f.storage_path), 3600)).data ?? [] : [];
  return Response.json({
    response: resp,
    files: (files ?? []).map((f) => ({ id: f.id, filename: f.filename, kind: f.kind, url: signed.find((x) => x.path === f.storage_path)?.signedUrl ?? null })),
    lines: lines ?? [],
    extraction: ext,
    terms,
  });
}
