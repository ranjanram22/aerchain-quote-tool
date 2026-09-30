// Vendor C: Word document with commercials written as paragraphs.
// Quotes 27 of 30 lines, offers 150 GSM instead of 180 GSM on one line,
// prices two mailers "per box of 50" and one partition "per bundle" (count not stated).
import fs from "node:fs";
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from "docx";
import { LINES } from "../data";
import { cRate, C_BOX_OF, C_DEVIATION_LINE } from "../quotes";
import { certificate } from "./pdf";

const rs = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const L = (n: number) => LINES[n - 1];
const sz = (n: number) => L(n).dims!.join(" x ") + " mm";

export async function generateVendorC(outDir: string) {
  const p = (text: string, opts: { bold?: boolean; after?: number } = {}) =>
    new Paragraph({
      spacing: { after: opts.after ?? 160 },
      children: text.split("\n").map((t, i) => new TextRun({ text: t, bold: opts.bold, size: 22, font: "Calibri", break: i ? 1 : 0 })),
    });

  const shipper3 = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((n) => `${sz(n).replace(" mm", "")} at ${rs(cRate(n))}`)
    .join("; ");
  const shipper5 = [9, 10, 12, 13, 14, 15, 16].map((n) => `${sz(n).replace(" mm", "")} at ${rs(cRate(n))}`).join("; ");

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DECCAN BOARD & BOXES PVT. LTD.", bold: true, size: 32, font: "Calibri", color: "2E5E1E" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: "Gat No. 412, Khed Shivapur Road, MIDC Satara 415004  •  sunita.j@deccanboard.example", size: 18, font: "Calibri" })] }),
    p("Date: 30 September 2026"),
    p("To: Purchase Team, Chakan Plant (Pune)"),
    p("Subject: Our offer for corrugated packaging requirement, FY27", { bold: true }),
    p("Dear Sir,"),
    p("Thank you for inviting us to participate. We have studied your requirement and are pleased to offer our rates below. All rates are in Indian Rupees, exclusive of GST (18%), and include door delivery to your Chakan plant."),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "1. Shipper boxes", bold: true, size: 24, font: "Calibri" })] }),
    p(`For the plain 3-ply RSC boxes (B/C flute, 150/120/150 GSM, BF 16–18) our per piece rates are: ${shipper3}.`),
    p(`For the 5-ply RSC boxes (BC flute, 180/120/150/120/180 GSM) our per piece rates are: ${shipper5}.`),
    p(`For the 5-ply box ${sz(C_DEVIATION_LINE)} we propose our standard construction with 150 GSM outer and inner liners (150/120/150/120/150, BF 20) in place of the 180 GSM liners asked, which gives adequate strength for this size in our experience. Rate for this construction is ${rs(cRate(C_DEVIATION_LINE))} per piece.`),
    p("We regret that we are unable to offer the 7-ply heavy-duty boxes (600x400x500 and 800x600x500) as our corrugator is limited to 5-ply. For the 500x400x400 7-ply box we can supply through our associate unit at " + rs(cRate(19)) + " per piece."),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "2. Mailers and printed boxes", bold: true, size: 24, font: "Calibri" })] }),
    p(`E-flute die-cut mailers are packed in boxes of ${C_BOX_OF}. The 250x180x60 mailer is ${rs(cRate(20))} per box of ${C_BOX_OF} and the 300x220x80 mailer is ${rs(cRate(21))} per box of ${C_BOX_OF}. The larger 350x250x100 mailer is ${rs(cRate(22))} per piece.`),
    p(`Printed items: 3-ply 300x200x150 with 1-colour flexo at ${rs(cRate(23))} each, 5-ply 400x300x250 with 2-colour flexo at ${rs(cRate(24))} each, and the printed E-flute mailer 280x200x70 (2 colour) at ${rs(cRate(25))} each. Plate and die cost will be borne by us.`),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "3. Sheets and partitions", bold: true, size: 24, font: "Calibri" })] }),
    p(`Corrugated sheets 3-ply 1000x800 at ${rs(cRate(26))} per kg and 5-ply pads 1200x1000 at ${rs(cRate(27))} per kg.`),
    p(`The 12-cell partition set (for 400x300 box) is ${rs(cRate(28))} per set. The 24-cell partition (for 500x400 box) is supplied in bundles at ${rs(cRate(29))} per bundle.`),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "4. Commercial terms", bold: true, size: 24, font: "Calibri" })] }),
    p("Payment terms: 60 days from receipt of material is acceptable to us. Delivery: 10 days from purchase order. Validity: this offer is valid for 60 days. GST at 18% will be charged extra. Prices are firm for the contract period subject to kraft paper prices not moving by more than 8%."),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "5. About us (your questionnaire)", bold: true, size: 24, font: "Calibri" })] }),
    p("We are ISO 9001:2015 certified (certificate attached). We do not hold FSC certification at present. Our QC lab has burst strength, BCT and ECT testers and we will share test reports with each lot. Our converting capacity is about 400 MT per month from our Satara plant, which is around 130 km from Chakan."),
    p("Quality control covers incoming reel checks (GSM, BF, moisture), in-process checks on the corrugator and a final AQL inspection. We have in-house 2-colour flexo printing. Current customers include two dairy cooperatives and a large snacks manufacturer. For contingency we keep 30 days of paper stock and have a tie-up with a job-work unit in Karad."),
    p("Our GSTIN is 27AADCD3390P1Z9."),
    p("We look forward to a long association."),
    p("Warm regards,"),
    p("Sunita Jadhav\nHead – Sales, Deccan Board & Boxes Pvt. Ltd.\n+91 94220 55310"),
  ];

  const doc = new Document({ creator: "Deccan Board & Boxes", sections: [{ children }] });
  fs.writeFileSync(`${outDir}/Deccan_Board_Offer_Chakan_FY27.docx`, await Packer.toBuffer(doc));

  await certificate(`${outDir}/Deccan_ISO_9001.pdf`, {
    body: "INTERCERT QUALITY SERVICES (INDIA) LLP",
    title: "CERTIFICATE",
    standard: "ISO 9001:2015 Quality Management System",
    holder: "DECCAN BOARD & BOXES PVT. LTD.",
    address: "Gat No. 412, Khed Shivapur Road, MIDC Satara 415004, India",
    certNo: "IQS-IN-QM-5521",
    scope: "Design and manufacture of corrugated boxes, mailers and partitions",
    issued: "02 August 2025",
    validUntil: "01 August 2028",
    accent: "#2e5e1e",
  });
}
