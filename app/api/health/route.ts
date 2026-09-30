import { db, isSupabaseConfigured, STORAGE_BUCKET } from "@/lib/supabase";

// Reports which pieces of setup are in place, without revealing any secret.
export async function GET() {
  const checks = {
    openrouterKey: Boolean(process.env.OPENROUTER_API_KEY),
    supabaseEnv: isSupabaseConfigured(),
    schema: false,
    bucket: false,
    error: null as string | null,
  };
  if (checks.supabaseEnv) {
    try {
      const { error } = await db().from("llm_calls").select("id", { head: true, count: "exact" });
      if (error) throw new Error(`schema: ${error.message}`);
      checks.schema = true;
      const { data, error: bErr } = await db().storage.getBucket(STORAGE_BUCKET);
      if (bErr) throw new Error(`bucket: ${bErr.message}`);
      checks.bucket = Boolean(data);
    } catch (e) {
      checks.error = e instanceof Error ? e.message : String(e);
    }
  }
  return Response.json(checks);
}
