import Link from "next/link";
import { connection } from "next/server";
import AdminTabs from "@/components/AdminTabs";
import SystemCheck from "@/components/SystemCheck";
import { isSupabaseConfigured } from "@/lib/supabase";
import { loadHome } from "@/lib/home-data";
import { createDraft } from "@/app/actions/draft";
import { logout } from "@/app/actions/auth";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  sent: { label: "Sent", cls: "bg-sky-100 text-sky-800" },
  collecting: { label: "Collecting responses", cls: "bg-amber-100 text-amber-800" },
  evaluating: { label: "Evaluating", cls: "bg-emerald-100 text-emerald-800" },
};

export default async function Home() {
  await connection();
  let data: Awaited<ReturnType<typeof loadHome>> | null = null;
  let error: string | null = null;
  if (!isSupabaseConfigured()) error = "Database not connected yet.";
  else {
    try {
      data = await loadHome();
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load data.";
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quote Desk</h1>
          <p className="text-sm text-slate-500">Draft RFx · read any quote · compare · decide</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">Ranjan (Buyer)</span>
          <form action={logout}><button className="text-xs text-slate-500 hover:underline">Sign out</button></form>
          <form action={createDraft}>
            <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">New RFx</button>
          </form>
        </div>
      </header>

      {error || !data ? (
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">{error}</p>
          <SystemCheck />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 font-medium">RFx list</div>
            {data.rfxs.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No RFx yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Responses</th>
                    <th className="px-4 py-2 font-medium">Open ⚠ items</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rfxs.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/rfx/${r.id}`} className="text-indigo-700 hover:underline">{r.title}</Link>
                      </td>
                      <td className="px-4 py-3">{r.category ?? "—"}</td>
                      <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[r.status]?.cls ?? ""}`}>{STATUS[r.status]?.label ?? r.status}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.replied}/{r.invited}</td>
                      <td className="px-4 py-3 tabular-nums">{r.openItems > 0 ? <span className="text-amber-700">⚠ {r.openItems}</span> : "0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <AdminTabs vendors={data.vendors} products={data.products} lastYear={data.lastYear} fx={data.fx} />
        </div>
      )}
    </div>
  );
}
