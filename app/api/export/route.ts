import ExcelJS from "exceljs";
import type { AnswerTable } from "@/lib/agent/types";

// POST an answer table → .xlsx download. Numbers stay numbers (not text).
export async function POST(req: Request) {
  const { table, question } = (await req.json()) as { table: AnswerTable; question?: string };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(table.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow([table.title]).font = { bold: true, size: 13 };
  if (question) ws.addRow([`Question: ${question}`]).font = { italic: true, color: { argb: "FF64748B" } };
  ws.addRow([]);
  const header = ws.addRow(table.columns.map((c) => c.label));
  header.font = { bold: true };
  for (const r of table.rows) {
    const row = ws.addRow(table.columns.map((c) => r[c.key] ?? null));
    table.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.format === "inr" || c.format === "inr_short") cell.numFmt = "₹#,##,##0.00";
      if (c.format === "pct") cell.numFmt = '0.00"%"';
    });
  }
  if (table.note) { ws.addRow([]); ws.addRow([table.note]).font = { italic: true }; }
  ws.addRow([`Generated ${new Date().toISOString()} by Quote Desk. Numbers computed deterministically from extracted quotes.`]).font = { size: 9, color: { argb: "FF94A3B8" } };
  ws.columns.forEach((col) => (col.width = 18));
  const buf = await wb.xlsx.writeBuffer();
  const name = table.title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60) || "table";
  return new Response(buf, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"` } });
}
