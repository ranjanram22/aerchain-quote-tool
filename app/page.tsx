import { connection } from "next/server";
import SystemCheck from "@/components/SystemCheck";
import { db, isSupabaseConfigured } from "@/lib/supabase";

interface RfxRow {
  id: string;
  title: string;
  category: string | null;
  status: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  collecting: "Collecting responses",
  evaluating: "Evaluating",
};

async function loadRfxs(): Promise<{ rows: RfxRow[]; error: string | null }> {
  if (!isSupabaseConfigured()) return { rows: [], error: "Database not connected yet." };
  const { data, error } = await db()
    .from("rfxs")
    .select("id,title,category,status,created_at")
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: "Database tables not found. Run supabase/schema.sql." };
  return { rows: data ?? [], error: null };
}

export default async function Home() {
  await connection(); // always render with fresh data
  const { rows, error } = await loadRfxs();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quote Desk</h1>
          <p className="text-sm text-slate-500">Draft RFx · read any quote · compare · decide</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">Ranjan (Buyer)</span>
          <button
            disabled
            title="Co-pilot arrives in Phase 5"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            New RFx
          </button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 font-medium">RFx list</div>
          {error ? (
            <p className="px-4 py-6 text-sm text-slate-500">{error}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No RFx yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-normal">Title</th>
                  <th className="px-4 py-2 font-normal">Category</th>
                  <th className="px-4 py-2 font-normal">Created</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{r.title}</td>
                    <td className="px-4 py-2">{r.category ?? "—"}</td>
                    <td className="px-4 py-2">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <aside>
          <SystemCheck />
        </aside>
      </div>
    </div>
  );
}
