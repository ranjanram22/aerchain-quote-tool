// Runs the pipeline on samples/unseen as replies from three extra vendors.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createResponse, runExtraction, guessMime } from "../../lib/extract/run";

const U = path.resolve(__dirname, "../../samples/unseen");
async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rfx } = await db.from("rfxs").select("id").eq("title", "Corrugated Packaging — Chakan Plant FY27 Annual Contract").single();
  const jobs: [string, string[], string | null][] = [
    ["Sahyadri Corrupack", ["sahyadri_rates.csv"], null],
    ["Kolhapur Kraft Boxes", ["KKB_quotation_scan.pdf"], null],
    ["Sai Packaging", [], fs.readFileSync(path.join(U, "WhatsApp Chat with Vinod Sai Packaging.txt"), "utf8")],
  ];
  for (const [name, files, text] of jobs) {
    let { data: v } = await db.from("vendors").select("id").eq("name", name).maybeSingle();
    if (!v) v = (await db.from("vendors").insert({ name, city: "—", state: "Maharashtra", categories: ["Corrugated boxes"] }).select("id").single()).data;
    await db.from("rfx_vendors").upsert({ rfx_id: rfx!.id, vendor_id: v!.id, status: "invited" });
    const id = await createResponse({ rfxId: rfx!.id, vendorId: v!.id, emailText: text, files: files.map((f) => ({ filename: f, mime: guessMime(f), data: fs.readFileSync(path.join(U, f)) })) });
    const t0 = Date.now();
    const r = await runExtraction(id);
    console.log(`${name}: ${r.ok ? `${r.lines} lines, conf ${r.confidence}, ${r.model}${r.cached ? " (cache)" : ""}` : "FAILED " + r.error} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
