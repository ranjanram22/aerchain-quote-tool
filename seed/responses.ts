// Loads each seed vendor's reply from seed/files and runs the REAL extraction
// pipeline on it (same code path as an upload in the app).
import fs from "node:fs";
import path from "node:path";
import { createResponse, runExtraction, guessMime } from "../lib/extract/run";
import { VENDORS } from "./data";

const RECEIVED: Record<string, string> = {
  A: "2026-09-29T16:05:00+05:30",
  B: "2026-09-28T11:20:00+05:30",
  C: "2026-09-30T10:12:00+05:30",
  D: "2026-09-29T12:40:00+05:30",
  E: "2026-09-29T21:47:00+05:30",
};

export function seedReply(key: string) {
  const dir = path.resolve(__dirname, "files", `vendor-${key.toLowerCase()}`);
  let emailText: string | null = null;
  const files: { filename: string; mime: string; data: Buffer }[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (name === "email.txt") emailText = fs.readFileSync(full, "utf8");
    else files.push({ filename: name, mime: guessMime(name), data: fs.readFileSync(full) });
  }
  return { emailText, files };
}

export async function loadAndExtract(rfxId: string, vendorIds: Record<string, string>, keys: string[]) {
  // One vendor at a time: free-tier models have low requests-per-minute limits.
  const results = [];
  for (const k of keys) {
    results.push(await (async () => {
      const t0 = Date.now();
      const { emailText, files } = seedReply(k);
      const responseId = await createResponse({ rfxId, vendorId: vendorIds[k], emailText, files, receivedAt: RECEIVED[k] });
      const r = await runExtraction(responseId);
      const name = VENDORS.find((v) => v.key === k)!.name;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      if (r.ok) console.log(`  ${k} ${name}: ${r.lines} line quotes, confidence ${r.confidence}, model ${r.model}${r.cached ? " (from cache — no model call)" : ""}, ${secs}s`);
      else console.log(`  ${k} ${name}: FAILED after ${secs}s — ${r.error}`);
      return r;
    })());
  }
  return results;
}
