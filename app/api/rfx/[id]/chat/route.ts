import { answerQuestion } from "@/lib/agent/run";
import type { ChatTurn } from "@/lib/agent/types";
import { ndjson } from "@/lib/stream";

export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/rfx/[id]/chat">) {
  const { id } = await ctx.params;
  const { question, history } = (await req.json()) as { question: string; history?: ChatTurn[] };
  if (!question?.trim()) return Response.json({ error: "Ask a question." }, { status: 400 });
  return ndjson((status) => answerQuestion(id, question.trim(), history ?? [], status));
}
