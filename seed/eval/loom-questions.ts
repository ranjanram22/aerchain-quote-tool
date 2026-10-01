// Rehearsal of the analyst questions for the recorded walkthrough.
//   npx tsx --conditions=react-server --env-file=.env.local seed/eval/loom-questions.ts [--only=2,5] [rfxId]
// Runs each question through the real chat pipeline (no hardcoded answers) and
// prints model, seconds, tools, number check and the answer text.
import { answerQuestion } from "../../lib/agent/run";
import { db } from "../../lib/supabase";

const QUESTIONS = [
  "Summarize this RFx: who replied, coverage, and what still needs my input.",
  "What if we split it, cheapest per line, but only among vendors who cleared the quality questionnaire? Use landed cost.",
  "If I can only work with two suppliers, who should they be and what does it cost me on a landed basis?",
  "How confident are we in Mahalaxmi's prices given it was a phone photo?",
  "Compare the cheapest-per-line award to last year as a chart by category.",
];

(async () => {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number);
  let id = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!id) id = (await db().from("rfxs").select("id").ilike("title", "%FY27%").limit(1).single()).data!.id;
  for (const [i, q] of QUESTIONS.entries()) {
    if (only && !only.includes(i + 1)) continue;
    const t = Date.now();
    try {
      const a = await answerQuestion(id, q, [], (s) => { if (/busy|retry|Switching/.test(s)) console.log(`   · ${s}`); });
      const j = a as unknown as Record<string, unknown>;
      console.log(`\n### ${q}\n${((Date.now() - t) / 1000).toFixed(1)}s · ${j.model} · tools: ${((j.method as { tool: string }[]) ?? []).map((m) => m.tool).join(", ")} · numbers ${JSON.stringify(j.numbers_check)}`);
      console.log(String(j.text ?? j.answer ?? "").slice(0, 1200));
      console.log(`tables: ${((j.tables as unknown[]) ?? []).length}, charts: ${((j.charts as unknown[]) ?? []).length}`);
    } catch (e) {
      console.log(`\n### ${q}\nFAILED after ${((Date.now() - t) / 1000).toFixed(1)}s: ${e instanceof Error ? e.message : e}`);
    }
  }
})();
