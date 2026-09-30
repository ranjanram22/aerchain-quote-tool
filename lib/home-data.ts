import "server-only";
import { db } from "./supabase";

export interface Vendor {
  id: string; name: string; contact_name: string | null; email: string | null; city: string | null;
  state: string | null; gstin: string | null; categories: string[];
}
export interface Product {
  id: string; name: string; type: string | null; ply: number | null; flute: string | null; gsm: string | null;
  bf: string | null; length_mm: number | null; width_mm: number | null; height_mm: number | null;
  print: string | null; base_unit: string; notes: string | null;
}
export interface LastYear {
  id: string; vendor: string; line_key: string; description: string | null; unit: string;
  price_inr: number; contract_ref: string | null; valid_from: string | null; valid_to: string | null;
}
export interface Fx { currency: string; rate_to_inr: number; as_of: string; source_note: string | null }
export interface RfxSummary {
  id: string; title: string; category: string | null; status: string; created_at: string;
  invited: number; replied: number; openItems: number;
}

export async function loadHome() {
  const [rfxs, vendors, products, lastYear, fx, invites, responses, openItems] = await Promise.all([
    db().from("rfxs").select("id,title,category,status,created_at").order("created_at", { ascending: false }),
    db().from("vendors").select("*").order("name"),
    db().from("products").select("*").order("name"),
    db().from("last_year_prices").select("*, vendors(name)").order("line_key"),
    db().from("fx_rates").select("*").order("currency"),
    db().from("rfx_vendors").select("rfx_id,vendor_id"),
    db().from("responses").select("rfx_id,vendor_id").is("superseded_by", null),
    db().from("open_items").select("rfx_id").eq("status", "open"),
  ]);
  const err = [rfxs, vendors, products, lastYear, fx, invites, responses, openItems].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);

  const summaries: RfxSummary[] = (rfxs.data ?? []).map((r) => ({
    ...r,
    invited: invites.data!.filter((i) => i.rfx_id === r.id).length,
    replied: new Set(responses.data!.filter((x) => x.rfx_id === r.id).map((x) => x.vendor_id)).size,
    openItems: openItems.data!.filter((o) => o.rfx_id === r.id).length,
  }));
  const ly: LastYear[] = (lastYear.data ?? []).map((r) => ({ ...r, vendor: r.vendors?.name ?? "—" }));
  return {
    rfxs: summaries,
    vendors: (vendors.data ?? []) as Vendor[],
    products: (products.data ?? []) as Product[],
    lastYear: ly,
    fx: (fx.data ?? []) as Fx[],
  };
}
