"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/supabase";

const BUYER = "Ranjan (Buyer)";

export type ActionResult = { ok: true } | { ok: false, error: string };

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v == null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

async function audit(action: string, target: string, old_value: unknown, new_value: unknown) {
  await db().from("audit_log").insert({ actor: BUYER, action, target, old_value, new_value });
}

export async function saveVendor(form: FormData): Promise<ActionResult> {
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return { ok: false, error: "Vendor name is required." };
  const row = {
    name,
    contact_name: str(form, "contact_name"),
    email: str(form, "email"),
    city: str(form, "city"),
    state: str(form, "state"),
    gstin: str(form, "gstin"),
    categories: (str(form, "categories") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  if (id) {
    const { data: old } = await db().from("vendors").select("*").eq("id", id).single();
    const { error } = await db().from("vendors").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit("vendor_updated", `vendor:${id}`, old, row);
  } else {
    const { data, error } = await db().from("vendors").insert(row).select("id").single();
    if (error) return { ok: false, error: error.message };
    await audit("vendor_added", `vendor:${data.id}`, null, row);
  }
  refresh();
  return { ok: true };
}

export async function deleteVendor(id: string): Promise<ActionResult> {
  const { data: old } = await db().from("vendors").select("*").eq("id", id).single();
  const { error } = await db().from("vendors").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("vendor_deleted", `vendor:${id}`, old, null);
  refresh();
  return { ok: true };
}

export async function addProduct(form: FormData): Promise<ActionResult> {
  const name = str(form, "name");
  if (!name) return { ok: false, error: "Product name is required." };
  const row = {
    name,
    type: str(form, "type"),
    ply: num(form, "ply"),
    flute: str(form, "flute"),
    gsm: str(form, "gsm"),
    bf: str(form, "bf"),
    length_mm: num(form, "length_mm"),
    width_mm: num(form, "width_mm"),
    height_mm: num(form, "height_mm"),
    print: str(form, "print"),
    base_unit: str(form, "base_unit") ?? "piece",
    notes: str(form, "notes"),
  };
  const { data, error } = await db().from("products").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await audit("product_added", `product:${data.id}`, null, row);
  refresh();
  return { ok: true };
}

export async function saveFx(form: FormData): Promise<ActionResult> {
  const currency = str(form, "currency")?.toUpperCase();
  const rate = num(form, "rate_to_inr");
  const as_of = str(form, "as_of");
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Currency must be a 3-letter code, e.g. USD." };
  if (rate == null || rate <= 0) return { ok: false, error: "Rate must be a positive number." };
  if (!as_of) return { ok: false, error: "As-of date is required." };
  const { data: old } = await db().from("fx_rates").select("*").eq("currency", currency).maybeSingle();
  const row = { currency, rate_to_inr: rate, as_of, source_note: str(form, "source_note") ?? "Edited by buyer", updated_at: new Date().toISOString() };
  const { error } = await db().from("fx_rates").upsert(row);
  if (error) return { ok: false, error: error.message };
  await audit(old ? "fx_updated" : "fx_added", `fx:${currency}`, old, row);
  refresh();
  return { ok: true };
}
