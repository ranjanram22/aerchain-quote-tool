// Three extra test inputs for Phase 6 from a vendor that is never used while
// developing prompts. They reply to the same RFx, in formats not seen in seed.
import fs from "node:fs";
import sharp from "sharp";
import { newDoc } from "./pdf";

export async function generateUnseen(dir: string) {
  // 1) CSV with odd headers: prices per 1000, own codes, a subset of items.
  const csv = [
    "sr,item_desc_supplier,L_mm,W_mm,H_mm,construction,\"price_INR_per_1000\",remarks",
    "1,RSC 3 PLY,250,200,150,3P B flute 150/120/150,\"9,050\",",
    "2,RSC 3 PLY,300,200,200,3P B flute 150/120/150,\"11,250\",",
    "3,RSC 3 PLY,300,250,150,3P B flute 150/120/150,\"11,700\",",
    "4,RSC 3 PLY,350,250,200,3P C flute 150/120/150,\"13,650\",",
    "5,RSC 5 PLY,400,300,300,5P BC 180/120/150/120/180,\"30,400\",",
    "6,RSC 5 PLY,450,350,300,5P BC 180/120/150/120/180,\"35,900\",",
    "7,RSC 5 PLY,500,400,300,5P BC 180/120/150/120/180,\"41,500\",",
    "8,RSC 5 PLY,600,400,400,5P BC 180/120/150/120/180,\"56,200\",",
    "9,Partition 12 cell,400,300,280,3P,\"7,600\",per set",
    "10,Edge board,50,50,1000,5mm,\"6,150\",",
    ",,,,,,,",
    ",NOTE: GST 18% extra. Transport extra at actuals (approx Rs 18000 per truck). Payment 30 days. Validity 45 days.,,,,,,",
  ].join("\n");
  fs.writeFileSync(`${dir}/sahyadri_rates.csv`, csv);

  // 2) Scanned-looking PDF: typed quotation rendered to a skewed, noisy image
  // and embedded in a PDF with no text layer. Prices per dozen for some items.
  const W = 1240, H = 1754;
  const lines = [
    "KOLHAPUR KRAFT BOXES",
    "Shiroli MIDC, Kolhapur 416122",
    "",
    "QUOTATION No. KKB/112/26-27            Dt. 01-10-2026",
    "To: Purchase Dept, Chakan Plant",
    "",
    "Sl  Item                              Size            Rate",
    "1   Die cut mailer E flute            250x180x60      Rs 158 / dozen",
    "2   Die cut mailer E flute            300x220x80      Rs 199 / dozen",
    "3   Die cut mailer E flute            350x250x100     Rs 21.40 each",
    "4   Printed mailer 2 col              280x200x70      Rs 214 / dozen",
    "5   3 ply sheet                       1000x800        Rs 47.25 per kg",
    "6   5 ply pad                         1200x1000       Rs 50.10 per kg",
    "7   7 ply box                         600x400x500     Rs 121.00 each",
    "",
    "Terms: Ex-works Kolhapur. Freight Rs 1.20 per piece extra (boxes),",
    "Rs 0.80 per kg extra (sheets). GST 18% extra. Payment 45 days.",
    "Delivery 10 days. Offer valid 30 days.",
    "Special: 1.5% discount if order value exceeds Rs 25 lakh per quarter.",
    "",
    "We are ISO 9001 certified (cert valid till Mar 2027). No FSC.",
    "",
    "for Kolhapur Kraft Boxes        (sd/-)  A. Mane, Proprietor",
  ];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f4f1ea"/>`;
  lines.forEach((t, i) => {
    const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    svg += `<text x="90" y="${150 + i * 52}" font-family="Courier New, Courier" font-size="${i === 0 ? 40 : 25}" font-weight="${i === 0 ? "bold" : "normal"}" fill="#1a1a1a" xml:space="preserve">${esc}</text>`;
  });
  // speckle noise
  for (let k = 0; k < 900; k++) {
    const x = Math.floor((k * 7919) % W), y = Math.floor((k * 104729) % H);
    svg += `<circle cx="${x}" cy="${y}" r="${(k % 3) * 0.6 + 0.4}" fill="#555" opacity="0.35"/>`;
  }
  svg += `</svg>`;
  const img = await sharp(Buffer.from(svg)).rotate(1.8, { background: "#e8e4da" }).blur(0.7).grayscale().jpeg({ quality: 55 }).toBuffer();
  const meta = await sharp(img).metadata();
  const { doc, done } = newDoc(`${dir}/KKB_quotation_scan.pdf`, { margin: 0 });
  doc.image(img, 0, 0, { fit: [doc.page.width, doc.page.height], align: "center", valign: "center" });
  void meta;
  doc.end();
  await done;

  // 3) WhatsApp-style chat export.
  const wa = [
    "[01/10/26, 9:12:44 AM] Vinod (Sai Packaging): Good morning sir",
    "[01/10/26, 9:13:02 AM] Vinod (Sai Packaging): For chakan RFQ our rates",
    "[01/10/26, 9:14:30 AM] Vinod (Sai Packaging): 3ply 250x200x150 - 9.40\n300x200x200 - 11.60\n200x150x100 - 7.95\n400x300x200 - 15.20",
    "[01/10/26, 9:15:11 AM] Vinod (Sai Packaging): 5 ply all sizes 2% less than what we gave you in March",
    "[01/10/26, 9:15:40 AM] Vinod (Sai Packaging): 7 ply 800x600x500 - 49 per kilo, approx 3.3 kg",
    "[01/10/26, 9:16:05 AM] Vinod (Sai Packaging): Partition 24 cell 12.10",
    "[01/10/26, 9:16:20 AM] Vinod (Sai Packaging): Transport free upto chakan. gst extra",
    "[01/10/26, 9:18:51 AM] Vinod (Sai Packaging): ISO certificate will send tomorrow sir",
    "[01/10/26, 9:19:03 AM] Vinod (Sai Packaging): <Media omitted>",
  ].join("\n");
  fs.writeFileSync(`${dir}/WhatsApp Chat with Vinod Sai Packaging.txt`, wa);
}
