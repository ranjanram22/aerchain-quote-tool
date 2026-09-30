import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";

export default async function RfxWorkspace({ params }: PageProps<"/rfx/[id]">) {
  const { id } = await params;
  const { data: rfx } = await db().from("rfxs").select("id,title,location").eq("id", id).maybeSingle();
  if (!rfx) notFound();
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <Link href="/" className="text-sm text-indigo-700 hover:underline">← Home</Link>
      <h1 className="mt-3 text-xl font-semibold">{rfx.title}</h1>
      <p className="text-sm text-slate-500">{rfx.location}</p>
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        The RFx workspace (Summary, Comparison, Responses, Outbox, Activity) arrives in Phase 3.
      </p>
    </div>
  );
}
