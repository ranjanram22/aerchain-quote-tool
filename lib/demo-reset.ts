import "server-only";
// Resets the demo database to the seed state and loads the five vendor
// replies through the REAL extraction pipeline (served from the extraction
// cache when the same files were read before, so no model calls).
// Used by `npm run seed` and by Admin → System → "Reset demo data".
import fs from "node:fs";
import path from "node:path";
import { db as sdb } from "./supabase";
import { buildInviteEmail } from "./rfx-email";
import { createResponse, runExtraction, guessMime } from "./extract/run";
import {
  VENDORS, LINES, QUESTIONS, RFX, RFX_DATE, LAST_YEAR, LAST_YEAR_CONTRACT, FX, lineSpec, lineDescription,
} from "../seed/data";

const BUYER = "Ranjan (Buyer)";

const RECEIVED: Record<string, string> = {
  A: "2026-09-29T16:05:00+05:30",
  B: "2026-09-28T11:20:00+05:30",
  C: "2026-09-30T10:12:00+05:30",
  D: "2026-09-29T12:40:00+05:30",
  E: "2026-09-29T21:47:00+05:30",
};

export function seedReply(key: string) {
  const dir = path.join(process.cwd(), "seed", "files", `vendor-${key.toLowerCase()}`);
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

export async function loadAndExtract(rfxId: string, vendorIds: Record<string, string>, keys: string[], opts: { models?: string[]; noCache?: boolean } = {}, log: (line: string) => void = console.log) {
  // One vendor at a time: free-tier models have low requests-per-minute limits.
  const results = [];
  for (const k of keys) {
    results.push(await (async () => {
      const t0 = Date.now();
      const { emailText, files } = seedReply(k);
      const responseId = await createResponse({ rfxId, vendorId: vendorIds[k], emailText, files, receivedAt: RECEIVED[k] });
      const r = await runExtraction(responseId, opts);
      const name = VENDORS.find((v) => v.key === k)!.name;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      if (r.ok) log(`  ${k} ${name}: ${r.lines} line quotes, confidence ${r.confidence}, model ${r.model}${r.cached ? " (from cache — no model call)" : ""}, ${secs}s`);
      else log(`  ${k} ${name}: FAILED after ${secs}s — ${r.error}`);
      return r;
    })());
  }
  return results;
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

async function reset(db: ReturnType<typeof sdb>) {
  const all = "00000000-0000-0000-0000-000000000000";
  await must(db.from("rfxs").delete().neq("id", all), "clear rfxs");
  await must(db.from("last_year_prices").delete().neq("id", all), "clear last_year_prices");
  await must(db.from("vendors").delete().neq("id", all), "clear vendors");
  await must(db.from("products").delete().neq("id", all), "clear products");
  await must(db.from("fx_rates").delete().neq("currency", "__"), "clear fx_rates");
}

export async function resetDemo(log: (line: string) => void = () => {}, opts: { extract?: boolean } = {}) {
  const db = sdb();
  log("Resetting demo data…");
  await reset(db);

  const vendors = await must(
    db.from("vendors").insert(VENDORS.map((v) => ({ name: v.name, contact_name: v.contact_name, email: v.email, city: v.city, state: v.state, gstin: v.gstin, categories: v.categories }))).select("id,name"),
    "insert vendors",
  );
  const vendorId = (k: string) => vendors.find((v) => v.name === VENDORS.find((x) => x.key === k)!.name)!.id as string;
  log(`  ${vendors.length} vendors`);

  const products = await must(
    db.from("products").insert(
      LINES.map((l) => ({
        name: l.name,
        type: l.type,
        ply: l.ply,
        flute: l.flute,
        gsm: l.gsm,
        bf: l.bf,
        length_mm: l.dims?.[0] ?? null,
        width_mm: l.dims?.[1] ?? null,
        height_mm: l.dims && l.dims[2] ? l.dims[2] : null,
        print: l.print,
        base_unit: l.unit,
        notes: [l.extra, l.burst_kg_cm2 && `Burst ≥ ${l.burst_kg_cm2} kg/cm²`, l.bct_kgf && `BCT ≥ ${l.bct_kgf} kgf`, l.approx_weight_kg && `Approx. weight ${l.approx_weight_kg} kg/pc`]
          .filter(Boolean)
          .join("; ") || null,
      })),
    ).select("id,name"),
    "insert products",
  );
  log(`  ${products.length} catalog products`);

  await must(db.from("fx_rates").insert(FX), "insert fx");
  log(`  ${FX.length} FX rates`);

  const [rfx] = await must(
    db.from("rfxs").insert({ ...RFX, status: "collecting", rfx_date: RFX_DATE, created_at: `${RFX_DATE}T10:30:00+05:30` }).select("id"),
    "insert rfx",
  );

  const lineRows = await must(
    db.from("rfx_lines").insert(
      LINES.map((l) => ({
        rfx_id: rfx.id,
        line_no: l.line_no,
        product_id: products.find((p) => p.name === l.name)!.id,
        line_key: l.line_key,
        description: lineDescription(l),
        category: l.category,
        spec: lineSpec(l),
        unit: l.unit,
        annual_qty: l.annual_qty,
      })),
    ).select("id,line_no,description,unit,annual_qty"),
    "insert rfx_lines",
  );
  log(`  RFx with ${lineRows.length} lines`);

  const qRows = await must(
    db.from("rfx_questions").insert(QUESTIONS.map((q) => ({ ...q, rfx_id: rfx.id }))).select("q_no,text"),
    "insert questions",
  );

  await must(
    db.from("last_year_prices").insert(
      LAST_YEAR.map((r) => {
        const l = LINES[r.line_no - 1];
        const c = LAST_YEAR_CONTRACT[r.vendor];
        return {
          vendor_id: vendorId(r.vendor),
          line_key: l.line_key,
          description: lineDescription(l),
          unit: l.unit,
          price_inr: r.price_inr,
          contract_ref: c.ref,
          valid_from: c.valid_from,
          valid_to: c.valid_to,
        };
      }),
    ),
    "insert last_year_prices",
  );
  log(`  ${LAST_YEAR.length} last-year prices`);

  const invitedAt = `${RFX_DATE}T11:00:00+05:30`;
  await must(
    db.from("rfx_vendors").insert(VENDORS.map((v) => ({ rfx_id: rfx.id, vendor_id: vendorId(v.key), invited_at: invitedAt, status: "invited" }))),
    "insert rfx_vendors",
  );
  const sorted = [...lineRows].sort((a, b) => a.line_no - b.line_no);
  await must(
    db.from("outbox").insert(
      VENDORS.map((v) => {
        const { subject, body } = buildInviteEmail({
          rfx: { title: RFX.title, location: RFX.location, scope: RFX.scope, terms: RFX.terms },
          vendor: { name: v.name, contact_name: v.contact_name },
          lines: sorted,
          questions: qRows,
          buyerName: BUYER,
        });
        return { rfx_id: rfx.id, vendor_id: vendorId(v.key), kind: "invite", to_email: v.email, subject, body, sent_at: invitedAt };
      }),
    ),
    "insert outbox",
  );
  await must(
    db.from("audit_log").insert({ rfx_id: rfx.id, actor: BUYER, action: "rfx_published", target: "rfx", new_value: { vendors: VENDORS.length }, note: "Seeded: invitations sent (simulated)", at: invitedAt }),
    "insert audit",
  );
  log("  5 invitations in Outbox");
  if (opts.extract === false) {
    log("Done (skipped extraction).");
    return { rfxId: rfx.id as string, failed: 0 };
  }
  log("Running the extraction pipeline on each vendor's reply (a few minutes)…");
  const ids = Object.fromEntries(VENDORS.map((v) => [v.key, vendorId(v.key)]));
  const results = await loadAndExtract(rfx.id, ids, VENDORS.map((v) => v.key), {}, log);
  const failed = results.filter((r) => !r.ok).length;
  log(failed ? `Done with ${failed} failed extraction(s).` : "Done.");
  return { rfxId: rfx.id as string, failed };
}

