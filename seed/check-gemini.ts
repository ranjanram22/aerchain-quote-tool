// Lists the Gemini models this API key can use and pings the configured ones.
// Run: npm run check:gemini
import { listGeminiModels } from "../lib/gemini";
import { chat, textOf } from "../lib/llm";
import { GEMINI_FLASH, GEMINI_FLASH_LITE } from "../lib/models";

async function main() {
  const all = await listGeminiModels();
  const gen = all.filter((m) => m.actions?.includes("generateContent") && /flash/i.test(m.name) && !/image|tts|audio|live|embedding|native/i.test(m.name));
  console.log("Flash-family models available to this key:");
  for (const m of gen) console.log(`  ${m.name.replace("models/", "").padEnd(40)} ${m.displayName ?? ""}  (input ${m.inputTokenLimit ?? "?"} tokens)`);
  for (const id of [GEMINI_FLASH, GEMINI_FLASH_LITE]) {
    const t0 = Date.now();
    try {
      const r = await chat("ping", { messages: [{ role: "user", content: "Reply with the single word: ok" }], max_tokens: 300 }, { models: [id] });
      console.log(`PING ${id}: "${textOf(r).trim()}" (${Date.now() - t0} ms, resolved to ${r.completion.model})`);
    } catch (e) {
      console.log(`PING ${id}: FAILED — ${e instanceof Error ? e.message : e}`);
    }
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
