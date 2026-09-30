// npm run seed
// Resets the demo database and loads master data: vendors, catalog, FX,
// last-year prices, the RFx with lines and questionnaire, invitations.
// Vendor responses are loaded by running the real extraction pipeline on the
// files in seed/files (added in Phase 2). No extracted values are inserted here.
import { createClient } from "@supabase/supabase-js";
import {
  VENDORS, LINES, QUESTIONS, RFX, RFX_DATE, LAST_YEAR, LAST_YEAR_CONTRACT, FX, lineSpec, lineDescription,
} from "./data";
import { buildInviteEmail } from "../lib/rfx-email";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });
const BUYER = "Ranjan (Buyer)";

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

async function reset() {
  const all = "00000000-0000-0000-0000-000000000000";
  await must(db.from("rfxs").delete().neq("id", all), "clear rfxs");
  await must(db.from("last_year_prices").delete().neq("id", all), "clear last_year_prices");
  await must(db.from("vendors").delete().neq("id", all), "clear vendors");
  await must(db.from("products").delete().neq("id", all), "clear products");
  await must(db.from("fx_rates").delete().neq("currency", "__"), "clear fx_rates");
}

async function main() {
  console.log("Resetting demo data…");
  await reset();

  const vendors = await must(
    db.from("vendors").insert(VENDORS.map((v) => ({ name: v.name, contact_name: v.contact_name, email: v.email, city: v.city, state: v.state, gstin: v.gstin, categories: v.categories }))).select("id,name"),
    "insert vendors",
  );
  const vendorId = (k: string) => vendors.find((v) => v.name === VENDORS.find((x) => x.key === k)!.name)!.id as string;
  console.log(`  ${vendors.length} vendors`);

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
  console.log(`  ${products.length} catalog products`);

  await must(db.from("fx_rates").insert(FX), "insert fx");
  console.log(`  ${FX.length} FX rates`);

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
  console.log(`  RFx with ${lineRows.length} lines`);

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
  console.log(`  ${LAST_YEAR.length} last-year prices`);

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
  console.log("  5 invitations in Outbox");
  console.log("Done. Vendor responses are loaded by the extraction pipeline (Phase 2).");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
