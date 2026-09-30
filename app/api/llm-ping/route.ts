import { chat, textOf } from "@/lib/llm";
import { MODELS } from "@/lib/models";

export const maxDuration = 60;

// Phase 0 smoke test: one tiny call to the free chat model and one to the
// extraction model, so we know both routes on OpenRouter work.
export async function POST() {
  const tasks = ["ping", "extraction"] as const;
  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        const r = await chat(task, {
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_tokens: 400,
        }, { timeoutMs: 45_000 });
        const reply = textOf(r).trim();
        return { task, model: r.model, ok: /\bok\b/i.test(reply), reply: reply.slice(0, 80), latencyMs: r.latencyMs };
      } catch (err) {
        return {
          task,
          model: MODELS[task].model,
          ok: false,
          reply: err instanceof Error ? err.message.slice(0, 200) : "Unknown error",
          latencyMs: null,
        };
      }
    }),
  );
  return Response.json({ ok: results.every((r) => r.ok), results });
}
