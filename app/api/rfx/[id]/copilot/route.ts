import { copilotTurn, type CopilotTurn } from "@/lib/copilot";

export const maxDuration = 180;

export async function POST(req: Request, ctx: RouteContext<"/api/rfx/[id]/copilot">) {
  const { id } = await ctx.params;
  const { message, history } = (await req.json()) as { message: string; history?: CopilotTurn[] };
  if (!message?.trim()) return Response.json({ error: "Type a message." }, { status: 400 });
  try {
    return Response.json(await copilotTurn(id, message.trim(), history ?? []));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
