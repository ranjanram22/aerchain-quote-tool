import { copilotTurn, type CopilotTurn } from "@/lib/copilot";
import { ndjson } from "@/lib/stream";

export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/rfx/[id]/copilot">) {
  const { id } = await ctx.params;
  const { message, history } = (await req.json()) as { message: string; history?: CopilotTurn[] };
  if (!message?.trim()) return Response.json({ error: "Type a message." }, { status: 400 });
  return ndjson((status) => copilotTurn(id, message.trim(), history ?? [], status));
}
