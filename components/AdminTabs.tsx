"use client";

import { useState, useTransition } from "react";
import { saveVendor, deleteVendor, addProduct, saveFx, type ActionResult } from "@/app/actions/admin";
import type { Vendor, Product, LastYear, Fx } from "@/lib/home-data";
import SystemCheck from "./SystemCheck";

const TABS = ["Vendors", "Products catalog", "Last-year prices", "FX rates", "System"] as const;
type Tab = (typeof TABS)[number];

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-600">
      {label}
      <input {...rest} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none" />
    </label>
  );
}

function useFormAction(action: (f: FormData) => Promise<ActionResult>, onOk?: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const r = await action(fd);
      if (r.ok) {
        setError(null);
        form.reset();
        onOk?.();
      } else setError(r.error);
    });
  };
  return { pending, error, submit };
}

const th = "px-3 py-2 text-left text-xs font-medium text-slate-500";
const td = "px-3 py-2 text-sm";

function VendorForm({ vendor, onDone }: { vendor?: Vendor; onDone: () => void }) {
  const { pending, error, submit } = useFormAction(saveVendor, onDone);
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
      {vendor && <input type="hidden" name="id" value={vendor.id} />}
      <Input label="Name *" name="name" defaultValue={vendor?.name} required />
      <Input label="Contact name" name="contact_name" defaultValue={vendor?.contact_name ?? ""} />
      <Input label="Email" name="email" type="email" defaultValue={vendor?.email ?? ""} />
      <Input label="GSTIN (optional)" name="gstin" defaultValue={vendor?.gstin ?? ""} />
      <Input label="City" name="city" defaultValue={vendor?.city ?? ""} />
      <Input label="State" name="state" defaultValue={vendor?.state ?? ""} />
      <div className="md:col-span-2">
        <Input label="Categories (comma separated)" name="categories" defaultValue={vendor?.categories.join(", ") ?? ""} />
      </div>
      <div className="flex items-center gap-3 md:col-span-4">
        <button disabled={pending} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {pending ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-slate-500">Cancel</button>
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
    </form>
  );
}

function Vendors({ vendors }: { vendors: Vendor[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEditing("new")} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">+ Add vendor</button>
      </div>
      {editing === "new" && <VendorForm onDone={() => setEditing(null)} />}
      <table className="w-full">
        <thead><tr className="border-b border-slate-200">
          <th className={th}>Name</th><th className={th}>Contact</th><th className={th}>Location</th><th className={th}>GSTIN</th><th className={th}>Categories</th><th className={th}></th>
        </tr></thead>
        <tbody>
          {vendors.map((v) =>
            editing === v.id ? (
              <tr key={v.id}><td colSpan={6} className="py-2"><VendorForm vendor={v} onDone={() => setEditing(null)} /></td></tr>
            ) : (
              <tr key={v.id} className="border-b border-slate-100 align-top">
                <td className={`${td} font-medium`}>{v.name}</td>
                <td className={td}>{v.contact_name ?? "—"}<div className="text-xs text-slate-500">{v.email}</div></td>
                <td className={td}>{[v.city, v.state].filter(Boolean).join(", ") || "—"}</td>
                <td className={`${td} font-mono text-xs`}>{v.gstin ?? "—"}</td>
                <td className={`${td} text-xs text-slate-600`}>{v.categories.join(", ")}</td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <button onClick={() => setEditing(v.id)} className="text-indigo-600 hover:underline">Edit</button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete ${v.name}? This also removes their responses and invitations.`)) start(async () => { await deleteVendor(v.id); });
                    }}
                    className="ml-3 text-rose-600 hover:underline disabled:opacity-50"
                  >Delete</button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Products({ products }: { products: Product[] }) {
  const [adding, setAdding] = useState(false);
  const { pending, error, submit } = useFormAction(addProduct, () => setAdding(false));
  const dims = (p: Product) => [p.length_mm, p.width_mm, p.height_mm].filter((x) => x != null).join(" × ") || "—";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">The RFx co-pilot uses this catalog when drafting line items.</p>
        <button onClick={() => setAdding(true)} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">+ Add product</button>
      </div>
      {adding && (
        <form onSubmit={submit} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-6">
          <div className="md:col-span-2"><Input label="Name *" name="name" required /></div>
          <Input label="Type" name="type" placeholder="RSC box" />
          <Input label="Ply" name="ply" type="number" />
          <Input label="Flute" name="flute" placeholder="B / C / BC / E" />
          <Input label="Base unit" name="base_unit" placeholder="piece / kg / set" />
          <Input label="Paper GSM" name="gsm" placeholder="150/120/150" />
          <Input label="BF" name="bf" />
          <Input label="Length mm" name="length_mm" type="number" />
          <Input label="Width mm" name="width_mm" type="number" />
          <Input label="Height mm" name="height_mm" type="number" />
          <Input label="Print" name="print" placeholder="Plain" />
          <div className="md:col-span-6"><Input label="Notes" name="notes" /></div>
          <div className="flex items-center gap-3 md:col-span-6">
            <button disabled={pending} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">{pending ? "Saving…" : "Add product"}</button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-slate-500">Cancel</button>
            {error && <span className="text-sm text-rose-600">{error}</span>}
          </div>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-200">
            <th className={th}>Name</th><th className={th}>Type</th><th className={th}>Ply</th><th className={th}>Flute</th><th className={th}>Paper GSM</th><th className={th}>BF</th><th className={th}>L × W × H mm</th><th className={th}>Print</th><th className={th}>Unit</th><th className={th}>Notes</th>
          </tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className={`${td} font-medium`}>{p.name}</td><td className={td}>{p.type ?? "—"}</td><td className={td}>{p.ply ?? "—"}</td>
                <td className={td}>{p.flute ?? "—"}</td><td className={`${td} font-mono text-xs`}>{p.gsm ?? "—"}</td><td className={td}>{p.bf ?? "—"}</td>
                <td className={td}>{dims(p)}</td><td className={td}>{p.print ?? "—"}</td><td className={td}>{p.base_unit}</td>
                <td className={`${td} text-xs text-slate-500`}>{p.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LastYearPrices({ rows }: { rows: LastYear[] }) {
  const sorted = [...rows].sort((a, b) => a.vendor.localeCompare(b.vendor) || a.line_key.localeCompare(b.line_key));
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Last year&apos;s contract (read-only). Used to resolve replies like &ldquo;same as last year&rdquo;.</p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-200">
            <th className={th}>Vendor</th><th className={th}>Line key</th><th className={th}>Description</th><th className={th}>Unit</th><th className={`${th} text-right`}>Price (INR)</th><th className={th}>Contract</th><th className={th}>Valid</th>
          </tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className={td}>{r.vendor}</td><td className={`${td} font-mono text-xs`}>{r.line_key}</td><td className={`${td} text-xs`}>{r.description}</td>
                <td className={td}>{r.unit}</td><td className={`${td} text-right tabular-nums`}>{inr(Number(r.price_inr))}</td>
                <td className={`${td} font-mono text-xs`}>{r.contract_ref}</td><td className={`${td} text-xs`}>{date(r.valid_from)} – {date(r.valid_to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FxRow({ fx }: { fx: Fx }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, submit } = useFormAction(saveFx, () => setEditing(false));
  if (!editing)
    return (
      <tr className="border-b border-slate-100">
        <td className={`${td} font-medium`}>{fx.currency}</td>
        <td className={`${td} tabular-nums`}>{Number(fx.rate_to_inr).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</td>
        <td className={td}>{date(fx.as_of)}</td>
        <td className={`${td} text-xs text-slate-500`}>{fx.source_note}</td>
        <td className={`${td} text-right`}>{fx.currency !== "INR" && <button onClick={() => setEditing(true)} className="text-indigo-600 hover:underline">Edit</button>}</td>
      </tr>
    );
  return (
    <tr className="border-b border-slate-100">
      <td colSpan={5} className="py-2">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="currency" value={fx.currency} />
          <span className="pb-1.5 font-medium">{fx.currency}</span>
          <Input label="1 unit = ₹" name="rate_to_inr" type="number" step="0.0001" defaultValue={fx.rate_to_inr} required />
          <Input label="As of" name="as_of" type="date" defaultValue={fx.as_of} required />
          <Input label="Source / note" name="source_note" defaultValue={fx.source_note ?? ""} />
          <button disabled={pending} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
          <button type="button" onClick={() => setEditing(false)} className="pb-1.5 text-sm text-slate-500">Cancel</button>
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </form>
      </td>
    </tr>
  );
}

function FxRates({ rows }: { rows: Fx[] }) {
  const [adding, setAdding] = useState(false);
  const { pending, error, submit } = useFormAction(saveFx, () => setAdding(false));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Used to convert foreign-currency quotes to INR. Every converted price shows the rate and as-of date.</p>
        <button onClick={() => setAdding(true)} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">+ Add currency</button>
      </div>
      {adding && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Input label="Currency" name="currency" placeholder="GBP" maxLength={3} required />
          <Input label="1 unit = ₹" name="rate_to_inr" type="number" step="0.0001" required />
          <Input label="As of" name="as_of" type="date" required />
          <Input label="Source / note" name="source_note" />
          <button disabled={pending} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">{pending ? "Saving…" : "Add"}</button>
          <button type="button" onClick={() => setAdding(false)} className="pb-1.5 text-sm text-slate-500">Cancel</button>
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </form>
      )}
      <table className="w-full">
        <thead><tr className="border-b border-slate-200">
          <th className={th}>Currency</th><th className={th}>Rate to INR</th><th className={th}>As of</th><th className={th}>Source</th><th className={th}></th>
        </tr></thead>
        <tbody>{rows.map((f) => <FxRow key={f.currency} fx={f} />)}</tbody>
      </table>
    </div>
  );
}

export default function AdminTabs(props: { vendors: Vendor[]; products: Product[]; lastYear: LastYear[]; fx: Fx[] }) {
  const [tab, setTab] = useState<Tab>("Vendors");
  const count: Partial<Record<Tab, number>> = {
    Vendors: props.vendors.length,
    "Products catalog": props.products.length,
    "Last-year prices": props.lastYear.length,
    "FX rates": props.fx.length,
  };
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-200 px-3">
        <span className="mr-3 py-3 text-sm font-semibold">Admin</span>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-3 text-sm ${tab === t ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t}
            {count[t] != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{count[t]}</span>}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "Vendors" && <Vendors vendors={props.vendors} />}
        {tab === "Products catalog" && <Products products={props.products} />}
        {tab === "Last-year prices" && <LastYearPrices rows={props.lastYear} />}
        {tab === "FX rates" && <FxRates rows={props.fx} />}
        {tab === "System" && <div className="max-w-sm"><SystemCheck /></div>}
      </div>
    </section>
  );
}
