// Re-run extraction for one or more seed vendors as a NEW response version.
// Usage: npm run extract -- A C
import { createClient } from "@supabase/supabase-js";
import { VENDORS } from "./data";
import { loadAndExtract } from "./responses";

async function main() {
  const keys = process.argv.slice(2).map((k) => k.toUpperCase());
  if (!keys.length) throw new Error("Give vendor keys, e.g. npm run extract -- A C");
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rfx } = await db.from("rfxs").select("id").order("created_at").limit(1).single();
  const { data: vendors } = await db.from("vendors").select("id,name");
  const ids = Object.fromEntries(VENDORS.map((v) => [v.key, vendors!.find((x) => x.name === v.name)!.id]));
  await loadAndExtract(rfx!.id, ids, keys);
}
main().catch((e) => { console.error(e); process.exit(1); });
