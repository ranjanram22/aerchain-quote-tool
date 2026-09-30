// Vendor A: polished Excel that ignores the RFx template. Own item names and
// column order, USD prices, freight as a per-shipment amount, all 30 lines.
import ExcelJS from "exceljs";
import { LINES, VENDORS } from "../data";
import { usdA, A_FREIGHT_USD_PER_SHIPMENT, A_SHIPMENTS_PER_MONTH } from "../quotes";

const shortCode = (n: number) => `TGP-CB${1000 + n * 7}`;

function theirName(n: number): string {
  const l = LINES[n - 1];
  switch (l.category) {
    case "3-ply RSC": return `Shipper Carton 3PLY ${l.flute}-Flute RSC`;
    case "5-ply RSC": return `Shipper Carton 5PLY ${l.flute}-Flute RSC`;
    case "7-ply heavy duty": return `HD Export Carton 7PLY`;
    case "Die-cut mailer": return `E-Flute Die Cut Mailer (tuck front)`;
    case "Printed box": return l.print.startsWith("1") ? "Printed RSC 3PLY - 1C Flexo" : l.ply === 5 ? "Printed RSC 5PLY - 2C Flexo" : "Printed Mailer E-Flute - 2C Flexo";
    case "Sheets & pads": return l.ply === 3 ? "Corr. Sheet 3PLY" : "Corr. Pad 5PLY";
    case "Partitions": return `Partition Insert ${l.extra?.replace(" cells", "")}`;
    case "Edge protectors": return "Edge Guard L-Profile";
    default: return l.name;
  }
}

export async function generateVendorA(outDir: string) {
  const v = VENDORS.find((x) => x.key === "A")!;
  const wb = new ExcelJS.Workbook();
  wb.creator = v.name;
  const ws = wb.addWorksheet("Commercial Offer");
  ws.columns = [
    { width: 6 }, { width: 14 }, { width: 38 }, { width: 18 }, { width: 22 }, { width: 11 }, { width: 13 }, { width: 12 }, { width: 14 },
  ];
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = "TRANSPAC GLOBAL PACKAGING (INDIA) PVT LTD";
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F3864" } };
  ws.mergeCells("A2:I2");
  ws.getCell("A2").value = "A member of the Transpac Group, Singapore  |  Warehouse: Bldg 7, Rajlaxmi Complex, Bhiwandi 421302";
  ws.getCell("A2").font = { size: 9, color: { argb: "FF595959" } };
  ws.getCell("A4").value = "Offer Ref:"; ws.getCell("B4").value = "TGP/IN/Q/26-0917";
  ws.getCell("A5").value = "Date:"; ws.getCell("B5").value = "29-Sep-2026";
  ws.getCell("A6").value = "Customer:"; ws.getCell("B6").value = "Chakan Plant – Corrugated FY27 RFQ";
  ws.getCell("F4").value = "Currency:"; ws.getCell("G4").value = "USD";
  ws.getCell("F5").value = "Price basis:"; ws.getCell("G5").value = "FCA Bhiwandi";
  ws.getCell("F6").value = "Validity:"; ws.getCell("G6").value = "60 days";
  ["A4", "A5", "A6", "F4", "F5", "F6"].forEach((c) => (ws.getCell(c).font = { bold: true }));

  const header = ["S/N", "Our Item Code", "Item Description", "Size (mm)", "Board Grade", "Est. Vol/yr", "UoM", "Unit Price", "Ext. Value"];
  const hr = ws.getRow(8);
  hr.values = header;
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } }; c.alignment = { wrapText: true, vertical: "middle" }; });

  // Their own ordering: grouped by their product families, not RFx order.
  const order = [23, 24, 25, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 28, 29, 26, 27, 30];
  let r = 9;
  order.forEach((n, i) => {
    const l = LINES[n - 1];
    const d = l.dims!;
    const size = l.unit === "kg" ? `${d[0]} x ${d[1]}` : l.category === "Edge protectors" ? `${d[0]}x${d[1]}x5 T, L=${d[2]}` : `${d[0]} x ${d[1]} x ${d[2]}`;
    const grade = l.gsm ? `${l.ply}P ${l.gsm} / BF${l.bf}` : "Paperboard 5mm";
    const uom = l.unit === "kg" ? "KG" : l.unit === "set" ? "SET" : "NOS";
    const row = ws.getRow(r);
    row.values = [i + 1, shortCode(n), theirName(n), size, grade, l.annual_qty, uom, usdA(n), null];
    row.getCell(9).value = { formula: `F${r}*H${r}` };
    row.getCell(8).numFmt = '"$"#,##0.000';
    row.getCell(9).numFmt = '"$"#,##0';
    row.getCell(6).numFmt = "#,##0";
    r++;
  });
  const totalRow = ws.getRow(r);
  totalRow.getCell(8).value = "Total";
  totalRow.getCell(9).value = { formula: `SUM(I9:I${r - 1})` };
  totalRow.getCell(9).numFmt = '"$"#,##0';
  totalRow.font = { bold: true };

  r += 2;
  const terms = [
    "Commercial terms",
    `Freight: Not included. Road freight to Chakan charged at USD ${A_FREIGHT_USD_PER_SHIPMENT} per shipment (32 ft FTL). Estimated ${A_SHIPMENTS_PER_MONTH} shipments per month for the volumes above.`,
    "Taxes: GST @18% extra as applicable, invoiced in INR at the SBI TT selling rate on the invoice date.",
    "Payment: 45 days from invoice.",
    "Lead time: 12 working days from PO for plain cartons; 15 working days for printed items.",
    "MOQ: 2,000 nos per SKU per call-off.",
  ];
  terms.forEach((t, i) => {
    ws.mergeCells(`A${r + i}:I${r + i}`);
    const c = ws.getCell(`A${r + i}`);
    c.value = t;
    c.font = i === 0 ? { bold: true } : { size: 10 };
    c.alignment = { wrapText: true };
  });

  const qs = wb.addWorksheet("Compliance");
  qs.columns = [{ width: 44 }, { width: 70 }];
  qs.addRow(["Supplier Questionnaire Response", ""]).font = { bold: true, size: 13 };
  qs.addRow([]);
  const qa: [string, string][] = [
    ["ISO 9001", "Yes – ISO 9001:2015, cert no. QMS/IN/88213 (copy attached)"],
    ["FSC certification", "Yes – FSC Chain of Custody, FSC-C171204 (copy attached)"],
    ["In-house testing (burst/BCT/ECT)", "Yes – full lab at Bhiwandi; CoA with every lot"],
    ["Monthly capacity", "1,200 MT per month (India)"],
    ["Plant / distance to Chakan", "Converting plant at Bhiwandi, approx. 190 km"],
    ["Lead time", "12 working days (plain), 15 (printed)"],
    ["Payment terms", "45 days from invoice (group policy; 60 days not possible)"],
    ["QC process", "Incoming reel testing (GSM, BF, moisture), inline caliper checks, AQL 1.5 final inspection"],
    ["Printing", "Yes – up to 4-colour flexo in-house"],
    ["Food / pharma customers", "Supplying 3 multinational FMCG and 2 pharma companies in West India (names on request)"],
    ["Contingency", "Backup converting at group plant in Chennai; 3 weeks of paper stock"],
    ["GSTIN", "27AAHCT4821K1Z6"],
  ];
  qa.forEach((row) => qs.addRow(row));
  qs.getColumn(2).alignment = { wrapText: true };

  await wb.xlsx.writeFile(`${outDir}/Transpac_Offer_TGP-IN-Q-26-0917.xlsx`);
}
