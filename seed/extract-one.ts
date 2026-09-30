// Re-run extraction for one or more seed vendors as a NEW response version.
// Usage: npm run extract -- A C
import { createClient } from "@supabase/supabase-js";
import { VENDORS } from "./data";
import { loadAndExtract } from "./responses";

async function main() {
  const args = process.argv.slice(2);
  const models = args.find((a) => a.startsWith("--models="))?.slice(9).split(",");
  const noCache = args.includes("--no-cache");
  const keys = args.filter((a) => !a.startsWith("--")).map((k) => k.toUpperCase());
  if (!keys.length) throw new Error("Give vendor keys, e.g. npm run extract -- A C");
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rfx } = await db.from("rfxs").select("id").eq("title", "Corrugated Packaging — Chakan Plant FY27 Annual Contract").single();
  const { data: vendors } = await db.from("vendors").select("id,name");
  const ids = Object.fromEntries(VENDORS.map((v) => [v.key, vendors!.find((x) => x.name === v.name)!.id]));
  await loadAndExtract(rfx!.id, ids, keys, { models, noCache });
}
main().catch((e) => { console.error(e); process.exit(1); });
