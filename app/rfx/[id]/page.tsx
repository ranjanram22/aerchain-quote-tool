import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { loadWorkspace } from "@/lib/workspace-data";
import Workspace from "@/components/workspace/Workspace";

export const maxDuration = 60;

export default async function RfxWorkspace({ params }: PageProps<"/rfx/[id]">) {
  await connection();
  const { id } = await params;
  const { data: rfx } = await db().from("rfxs").select("id").eq("id", id).maybeSingle();
  if (!rfx) notFound();
  const data = await loadWorkspace(id);
  return <Workspace data={data} />;
}
