import { copilotTurn } from "@/lib/copilot";
import { ndjson } from "@/lib/stream";

export const maxDuration = 300;

// The conversation history lives in the database (copilot_messages); the
// client sends only the new message. Streams status, text deltas and the result.
export async function POST(req: Request, ctx: RouteContext<"/api/rfx/[id]/copilot">) {
  const { id } = await ctx.params;
  const { message } = (await req.json()) as { message: string };
  if (!message?.trim()) return Response.json({ error: "Type a message." }, { status: 400 });
  return ndjson((status, event) => copilotTurn(id, message.trim(), {
    onStatus: status,
    onDelta: (text) => event({ type: "delta", text }),
    onReset: () => event({ type: "reset" }),
    onCommit: () => event({ type: "commit" }),
  }));
}
