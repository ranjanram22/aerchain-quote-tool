import { chat, textOf } from "@/lib/llm";
import { MODELS, displayModel } from "@/lib/models";

export const maxDuration = 60;

// Smoke test: one tiny call to each distinct free model in use.
export async function POST() {
  const models = [...new Set(Object.values(MODELS).flatMap((m) => m.chain))];
  const results = await Promise.all(
    models.map(async (m) => {
      try {
        const r = await chat("ping", { messages: [{ role: "user", content: "Reply with the single word: ok" }], max_tokens: 400 }, { models: [m], timeoutMs: 45_000 });
        const reply = textOf(r).trim();
        return { task: m, model: displayModel(m), ok: /\bok\b/i.test(reply), reply: reply.slice(0, 80), latencyMs: r.latencyMs };
      } catch (err) {
        return { task: m, model: displayModel(m), ok: false, reply: err instanceof Error ? err.message.slice(0, 200) : "Unknown error", latencyMs: null };
      }
    }),
  );
  return Response.json({ ok: results.every((r) => r.ok), results });
}
