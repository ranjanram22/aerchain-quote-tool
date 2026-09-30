// Small pdfkit helpers shared by the seed generators.
import PDFDocument from "pdfkit";
import fs from "node:fs";

export type Doc = PDFKit.PDFDocument;

export function newDoc(path: string, opts: PDFKit.PDFDocumentOptions = {}): { doc: Doc; done: Promise<void> } {
  const doc = new PDFDocument({ size: "A4", margin: 48, ...opts });
  const stream = fs.createWriteStream(path);
  doc.pipe(stream);
  const done = new Promise<void>((res, rej) => {
    stream.on("finish", () => res());
    stream.on("error", rej);
  });
  return { doc, done };
}

export interface Col {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

export function table(doc: Doc, cols: Col[], rows: string[][], opts: { fontSize?: number; headerFill?: string; zebra?: boolean } = {}) {
  const fs_ = opts.fontSize ?? 8.5;
  const x0 = doc.page.margins.left;
  const pad = 3;
  const drawRow = (cells: string[], header: boolean, idx: number) => {
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(fs_);
    const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: cols[i].width - 2 * pad }))) + 2 * pad;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
    }
    const y = doc.y;
    if (header && opts.headerFill) doc.rect(x0, y, cols.reduce((s, c) => s + c.width, 0), h).fill(opts.headerFill).fillColor("black");
    else if (!header && opts.zebra && idx % 2 === 1) doc.rect(x0, y, cols.reduce((s, c) => s + c.width, 0), h).fill("#f3f3f3").fillColor("black");
    let x = x0;
    cells.forEach((c, i) => {
      doc.fillColor(header && opts.headerFill ? "white" : "black");
      doc.text(c, x + pad, y + pad, { width: cols[i].width - 2 * pad, align: cols[i].align ?? "left" });
      x += cols[i].width;
    });
    doc.fillColor("black");
    doc.moveTo(x0, y + h).lineTo(x, y + h).lineWidth(0.4).strokeColor("#999999").stroke();
    doc.y = y + h;
    doc.x = x0;
  };
  drawRow(cols.map((c) => c.header), true, -1);
  rows.forEach((r, i) => drawRow(r, false, i));
  doc.moveDown(0.5);
}

export async function certificate(
  path: string,
  o: { body: string; title: string; standard: string; holder: string; address: string; certNo: string; scope: string; issued: string; validUntil: string; accent: string },
) {
  const { doc, done } = newDoc(path, { layout: "landscape", margin: 40 });
  const W = doc.page.width, H = doc.page.height;
  doc.rect(20, 20, W - 40, H - 40).lineWidth(4).strokeColor(o.accent).stroke();
  doc.rect(30, 30, W - 60, H - 60).lineWidth(1).strokeColor(o.accent).stroke();
  doc.fillColor(o.accent).font("Helvetica-Bold").fontSize(14).text(o.body, 0, 60, { align: "center", width: W });
  doc.fillColor("black").font("Times-Bold").fontSize(30).text(o.title, 0, 100, { align: "center", width: W });
  doc.font("Times-Roman").fontSize(13).text("This is to certify that the management system of", 0, 160, { align: "center", width: W });
  doc.font("Times-Bold").fontSize(20).text(o.holder, 0, 185, { align: "center", width: W });
  doc.font("Times-Roman").fontSize(11).text(o.address, 0, 212, { align: "center", width: W });
  doc.fontSize(13).text("has been assessed and found to conform to the requirements of", 0, 245, { align: "center", width: W });
  doc.font("Times-Bold").fontSize(18).text(o.standard, 0, 268, { align: "center", width: W });
  doc.font("Times-Roman").fontSize(11).text(`Scope: ${o.scope}`, 90, 305, { align: "center", width: W - 180 });
  doc.fontSize(11);
  doc.text(`Certificate No.: ${o.certNo}`, 90, 380);
  doc.text(`Date of issue: ${o.issued}`, 90, 398);
  doc.font("Times-Bold").text(`Valid until: ${o.validUntil}`, 90, 416);
  doc.font("Times-Italic").fontSize(10).text("Authorised signatory", W - 290, 410, { width: 200, align: "center" });
  doc.moveTo(W - 280, 405).lineTo(W - 100, 405).strokeColor("black").lineWidth(0.8).stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#666").text("Validity of this certificate is subject to successful surveillance audits. Verify at the certification body's website.", 0, H - 70, { align: "center", width: W });
  doc.end();
  await done;
}
