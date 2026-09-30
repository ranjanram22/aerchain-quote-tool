import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { loadWorkspace } from "@/lib/workspace-data";
import { loadDraft } from "@/lib/draft";
import Workspace from "@/components/workspace/Workspace";
import CoPilot from "@/components/draft/CoPilot";

export const maxDuration = 60;

export default async function RfxPage({ params }: PageProps<"/rfx/[id]">) {
  await connection();
  const { id } = await params;
  const { data: rfx } = await db().from("rfxs").select("id,status").eq("id", id).maybeSingle();
  if (!rfx) notFound();
  if (rfx.status === "draft") {
    const [d, { data: vendors }] = await Promise.all([loadDraft(id), db().from("vendors").select("id,name,email,categories").order("name")]);
    return <CoPilot rfx={d.rfx} lines={d.lines} questions={d.questions} vendors={vendors ?? []} />;
  }
  const data = await loadWorkspace(id);
  return <Workspace data={data} />;
}
