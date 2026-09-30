// Vendor B: PDF quotation on letterhead. Rates per 100 nos (per kg for sheets),
// a conditional cash discount buried in the footnotes, freight included.
// Also a burst/BCT test report PDF and an ISO certificate.
import { LINES, VENDORS } from "../data";
import { bRate, B_DISCOUNT_PCT, B_DISCOUNT_DAYS } from "../quotes";
import { newDoc, table, certificate } from "./pdf";

const inrFmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export async function generateVendorB(outDir: string) {
  const v = VENDORS.find((x) => x.key === "B")!;
  const { doc, done } = newDoc(`${outDir}/SGC_Quotation_SGC-Q-2026-311.pdf`);

  // Letterhead
  doc.rect(0, 0, doc.page.width, 78).fill("#7a1f1f");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(20).text("SHREE GANESH CORRUGATORS", 48, 18);
  doc.font("Helvetica").fontSize(8.5).text("Plot J-114, MIDC Bhosari, Pune 411026  |  Ph: 020-2712 4488  |  GSTIN: " + v.gstin, 48, 44);
  doc.text("Manufacturers of Corrugated Boxes, Sheets & Partitions since 1994", 48, 56);
  doc.fillColor("black");
  doc.y = 100;
  doc.font("Helvetica").fontSize(9.5);
  doc.text("Ref: SGC/Q/2026/311", 48, 100);
  doc.text("Date: 28/09/2026", 400, 100);
  doc.moveDown();
  doc.text("To,\nThe Purchase Department\nChakan Plant, Pune", 48);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").text("Sub: Quotation against your RFQ for Corrugated Packaging – FY27 Annual Contract");
  doc.font("Helvetica").moveDown(0.4);
  doc.text("Dear Sir/Madam,\nWith reference to your enquiry, we are pleased to submit our best rates as under:");
  doc.moveDown(0.6);

  const rows = LINES.map((l) => {
    const d = l.dims!;
    const size = l.unit === "kg" ? `${d[0]}x${d[1]}` : l.category === "Edge protectors" ? `${d[0]}x${d[1]}x5, ${d[2]}L` : `${d[0]}x${d[1]}x${d[2]}`;
    const per = l.unit === "kg" ? "Kg" : l.unit === "set" ? "100 Sets" : "100 Nos";
    return [String(l.line_no), l.name.replace(/ \d+x\d+(x\d+)?/, ""), size, l.ply ? `${l.ply} Ply` : "-", l.gsm ? `${l.gsm}\nBF ${l.bf}` : "-", inrFmt(bRate(l.line_no)) + "*", per];
  });
  table(
    doc,
    [
      { header: "Sr.", width: 26, align: "center" },
      { header: "Description", width: 170 },
      { header: "Size (mm)", width: 78 },
      { header: "Ply", width: 36, align: "center" },
      { header: "Paper (GSM / BF)", width: 90 },
      { header: "Rate (Rs.)", width: 58, align: "right" },
      { header: "Per", width: 42, align: "center" },
    ],
    rows,
    { fontSize: 7.8, headerFill: "#7a1f1f", zebra: true },
  );

  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9).text("Terms & Conditions:");
  doc.font("Helvetica").fontSize(8.2);
  const notes = [
    "1. All rates are in Indian Rupees per 100 nos / 100 sets unless mentioned as per Kg.",
    "2. Freight & delivery up to your Chakan plant is included in the above rates.",
    "3. GST @ 18% extra as applicable.",
    "4. Payment: 60 days from date of receipt of material.",
    "5. Delivery: 7 days from receipt of PO / schedule.",
    "6. Rates valid for 90 days from date of quotation. Paper price variation beyond +/-5% will be passed on at actuals.",
    "7. Tolerance on quantity +/- 10%.",
  ];
  notes.forEach((n) => doc.text(n));
  doc.moveDown(0.8);
  doc.text("Thanking you and assuring you of our best services,");
  doc.moveDown(0.3);
  doc.text("For SHREE GANESH CORRUGATORS");
  doc.moveDown(1.6);
  doc.text("Prakash Kulkarni\nPartner  |  +91 98220 41177");
  doc.moveDown(1);
  doc.fontSize(6.8).fillColor("#444").text(
    `* A cash discount of ${B_DISCOUNT_PCT}% on the invoice value is applicable where payment is released within ${B_DISCOUNT_DAYS} days of delivery. Not applicable on delayed payments.`,
  );
  doc.fillColor("black");

  // Page 2: technical compliance
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(12).text("Annexure – Supplier Information / Technical Compliance");
  doc.moveDown(0.5);
  const qa = [
    ["ISO 9001 certified", "Yes, ISO 9001:2015. Certificate enclosed."],
    ["FSC certified", "Applied, audit scheduled Dec 2026. Not certified as of date."],
    ["In-house testing", "Yes. Burst, BCT, ECT, GSM, moisture tester in-house. Test report sample enclosed; report with every lot."],
    ["Capacity", "650 MT per month (2 corrugation lines)"],
    ["Plant location", "MIDC Bhosari, Pune – 22 km from Chakan"],
    ["Lead time", "7 days from PO"],
    ["Payment terms", "60 days accepted"],
    ["Quality control", "Reel-wise incoming GSM/BF test, hourly in-process checks on corrugator, final inspection per lot with BCT sampling"],
    ["Printing", "Yes, 2-colour flexo printer-slotter in-house"],
    ["Food / pharma clients", "Leading dairy and biscuit manufacturers in Pune region; one pharma formulation unit at Ranjangaon"],
    ["Contingency", "Sister unit at Talegaon; 45 days kraft paper stock maintained"],
    ["GSTIN", v.gstin!],
  ];
  table(doc, [{ header: "Point", width: 150 }, { header: "Our response", width: 350 }], qa, { fontSize: 9, headerFill: "#7a1f1f" });
  doc.end();
  await done;

  await certificate(`${outDir}/SGC_ISO9001_Certificate.pdf`, {
    body: "BUREAU OF QUALITY ASSURANCE INDIA PVT LTD",
    title: "CERTIFICATE OF REGISTRATION",
    standard: "ISO 9001:2015",
    holder: "SHREE GANESH CORRUGATORS",
    address: "Plot J-114, MIDC Bhosari, Pune 411026, Maharashtra, India",
    certNo: "BQA/QMS/2024/10477",
    scope: "Manufacture and supply of corrugated boxes, sheets and partitions",
    issued: "12 March 2024",
    validUntil: "11 March 2027",
    accent: "#1d4e89",
  });

  // Test report
  const t = newDoc(`${outDir}/SGC_Test_Report_Lot2609.pdf`);
  const d = t.doc;
  d.font("Helvetica-Bold").fontSize(14).text("SHREE GANESH CORRUGATORS – QUALITY LAB");
  d.font("Helvetica").fontSize(10).text("Test Report No. SGC/QC/TR/2609-14      Date of test: 24/09/2026");
  d.moveDown(0.5);
  d.text("Sample: 5 Ply RSC box 400x300x300, Paper 180/120/150/120/180, BF 20, BC flute, Lot 2609-B");
  d.moveDown(0.5);
  table(
    d,
    [{ header: "Parameter", width: 170 }, { header: "Method", width: 110 }, { header: "Specification", width: 100 }, { header: "Result", width: 70 }, { header: "Status", width: 50 }],
    [
      ["Bursting strength (kg/cm2)", "IS 1060 Pt II", "min 12.0", "13.4", "OK"],
      ["Box compression (BCT, kgf)", "TAPPI T804", "min 450", "492", "OK"],
      ["Edge crush (ECT, kN/m)", "TAPPI T839", "min 7.0", "7.6", "OK"],
      ["Grammage (g/m2)", "IS 1060 Pt I", "900 +/- 5%", "912", "OK"],
      ["Moisture (%)", "IS 1060", "max 9.0", "7.8", "OK"],
    ],
    { fontSize: 9.5 },
  );
  d.moveDown();
  d.text("Tested by: S. Pawar (QC Chemist)          Approved by: M. Deshpande (QC Head)");
  d.end();
  await t.done;
}
