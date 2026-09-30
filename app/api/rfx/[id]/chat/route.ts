import { answerQuestion } from "@/lib/agent/run";
import type { ChatTurn } from "@/lib/agent/types";

export const maxDuration = 180;

export async function POST(req: Request, ctx: RouteContext<"/api/rfx/[id]/chat">) {
  const { id } = await ctx.params;
  const { question, history } = (await req.json()) as { question: string; history?: ChatTurn[] };
  if (!question?.trim()) return Response.json({ error: "Ask a question." }, { status: 400 });
  try {
    return Response.json(await answerQuestion(id, question.trim(), history ?? []));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: /timeout|timed out/i.test(msg) ? "The AI took too long to answer. Please try again." : msg.startsWith("The AI") ? msg : `Something went wrong: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
