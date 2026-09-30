import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { db, STORAGE_BUCKET } from "@/lib/supabase";

// Read-only HTML preview of Word / Excel / CSV / text files, so the original
// can be shown next to the extracted data. Cell references are kept visible.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font:12px/1.45 -apple-system,Segoe UI,sans-serif;margin:12px;color:#0f172a}
  table{border-collapse:collapse;font-size:11px}td,th{border:1px solid #e2e8f0;padding:2px 5px;white-space:nowrap}
  th{background:#f8fafc;color:#64748b;font-weight:500}h4{margin:14px 0 6px}p{margin:0 0 8px}.n{color:#94a3b8;font-size:10px;margin-right:6px}
  pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace}</style></head><body>${body}</body></html>`;

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[fid]/preview">) {
  const { fid } = await ctx.params;
  const { data: f } = await db().from("response_files").select("filename,storage_path").eq("id", fid).single();
  if (!f) return new Response("Not found", { status: 404 });
  const { data, error } = await db().storage.from(STORAGE_BUCKET).download(f.storage_path);
  if (error || !data) return new Response("Could not load file", { status: 500 });
  const buf = Buffer.from(await data.arrayBuffer());
  const name = f.filename.toLowerCase();
  let body = "";
  try {
    if (name.endsWith(".docx")) {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      body = value.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p, i) => `<p><span class="n">¶${i + 1}</span>${esc(p)}</p>`).join("");
    } else if (/\.(xlsx|xls|csv|ods|xlsm)$/.test(name)) {
      const wb = name.endsWith(".csv") ? XLSX.read(buf.toString("utf8"), { type: "string" }) : XLSX.read(buf, { type: "buffer" });
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        if (!ws["!ref"]) continue;
        const r = XLSX.utils.decode_range(ws["!ref"]);
        let t = `<h4>${esc(sn)}</h4><table><tr><th></th>`;
        for (let c = r.s.c; c <= r.e.c; c++) t += `<th>${XLSX.utils.encode_col(c)}</th>`;
        t += "</tr>";
        for (let row = r.s.r; row <= r.e.r; row++) {
          t += `<tr><th>${row + 1}</th>`;
          for (let c = r.s.c; c <= r.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r: row, c })];
            t += `<td>${cell ? esc(String(cell.w ?? cell.v)) : ""}</td>`;
          }
          t += "</tr>";
        }
        body += t + "</table>";
      }
    } else {
      body = `<pre>${esc(buf.toString("utf8"))}</pre>`;
    }
  } catch (e) {
    body = `<p>Preview failed: ${esc(e instanceof Error ? e.message : String(e))}</p>`;
  }
  return new Response(page(body), { headers: { "content-type": "text/html; charset=utf-8" } });
}
