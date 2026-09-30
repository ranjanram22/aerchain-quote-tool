// Vendor D: a printed rate card. Priced per kg for sheets and 7-ply boxes,
// with piece weights printed for only some per-kg lines. Rendered as a PNG
// (and a PDF for printing) that Ranjan photographs at an angle; the photo is
// the seed input.
import sharp from "sharp";
import fs from "node:fs";
import { LINES } from "../data";
import { dRate, dUnit, D_PER_KG_BOX_WEIGHTS } from "../quotes";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function rateCardSvg(): { svg: string; width: number; height: number } {
  const W = 1654, rowH = 52, top = 330;
  const H = top + rowH * (LINES.length + 1) + 330;
  const cols = [
    { h: "No.", w: 80 },
    { h: "Item", w: 560 },
    { h: "Size (mm)", w: 250 },
    { h: "Ply / Paper", w: 260 },
    { h: "Rate (Rs.)", w: 170 },
    { h: "Unit", w: 110 },
    { h: "Wt/pc", w: 124 },
  ];
  const x0 = 50;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="100%" height="100%" fill="#fdfbf5"/>`;
  s += `<text x="${W / 2}" y="95" font-family="Arial Black, Arial" font-size="58" text-anchor="middle" fill="#8b1a1a">MAHALAXMI PACKAGING WORKS</text>`;
  s += `<text x="${W / 2}" y="145" font-family="Arial" font-size="27" text-anchor="middle" fill="#333">Plot 58, MIDC Ambad, Nashik 422010  •  Ph 0253-238 6612  •  GSTIN 27AAPFM5512D1Z4</text>`;
  s += `<rect x="${x0}" y="175" width="${W - 2 * x0}" height="80" fill="#8b1a1a"/>`;
  s += `<text x="${W / 2}" y="230" font-family="Arial" font-weight="bold" font-size="42" text-anchor="middle" fill="#fff">RATE CARD  —  w.e.f. 15 Sept 2026</text>`;
  s += `<text x="${x0}" y="300" font-family="Arial" font-size="26" fill="#222">Prices ex-GST. Freight included for Pune district deliveries. Rates per piece unless stated.</text>`;
  let x = x0;
  s += `<rect x="${x0}" y="${top}" width="${W - 2 * x0}" height="${rowH}" fill="#e8dcc4"/>`;
  for (const c of cols) {
    s += `<text x="${x + 10}" y="${top + 35}" font-family="Arial" font-weight="bold" font-size="26">${esc(c.h)}</text>`;
    x += c.w;
  }
  LINES.forEach((l, i) => {
    const y = top + rowH * (i + 1);
    if (i % 2 === 1) s += `<rect x="${x0}" y="${y}" width="${W - 2 * x0}" height="${rowH}" fill="#f3eee2"/>`;
    const d = l.dims!;
    const size = l.unit === "kg" ? `${d[0]} x ${d[1]}` : l.category === "Edge protectors" ? `${d[0]}x${d[1]}x5, ${d[2]}L` : `${d[0]}x${d[1]}x${d[2]}`;
    const paper = l.ply ? `${l.ply}P ${l.gsm}` : "Board 5mm";
    const name = l.name.replace(/ \d+x\d+(x\d+)?/, "").replace(", 1-colour flexo", " (1C print)").replace(", 2-colour flexo", " (2C print)");
    const n = l.line_no;
    const w = n in D_PER_KG_BOX_WEIGHTS ? D_PER_KG_BOX_WEIGHTS[n] : null;
    const rate = dRate(n);
    const cells = [String(n), name, size, paper, rate.toFixed(2), dUnit(n).replace("per ", "/"), w ? `${w.toFixed(2)} kg` : "—"];
    let cx = x0;
    cells.forEach((c, j) => {
      const anchor = j === 4 ? "end" : "start";
      const tx = j === 4 ? cx + cols[j].w - 14 : cx + 10;
      s += `<text x="${tx}" y="${y + 35}" font-family="Arial" font-size="${j === 3 ? 21 : 25}" text-anchor="${anchor}" fill="#111">${esc(c)}</text>`;
      cx += cols[j].w;
    });
    s += `<line x1="${x0}" y1="${y + rowH}" x2="${W - x0}" y2="${y + rowH}" stroke="#bbb" stroke-width="1.5"/>`;
  });
  const fy = top + rowH * (LINES.length + 1) + 60;
  const foot = [
    "Notes: Per kg items billed on actual weighed quantity. Weight per piece shown where standard.",
    "Payment 30 days. Delivery 5–7 days. Rates valid till 31 Dec 2026.",
    "ISO 9001:2015 certified  •  In-house burst & BCT lab  •  Capacity 450 MT / month",
  ];
  foot.forEach((t, i) => (s += `<text x="${x0}" y="${fy + i * 44}" font-family="Arial" font-size="27" fill="#222">${esc(t)}</text>`));
  s += `<text x="${W - x0}" y="${fy + 200}" font-family="Arial" font-style="italic" font-size="28" text-anchor="end" fill="#444">For Mahalaxmi Packaging Works — R. Patil</text>`;
  s += `</svg>`;
  return { svg: s, width: W, height: H };
}

export async function generateVendorD(outDir: string, printDir: string) {
  const { svg } = rateCardSvg();
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(`${printDir}/Mahalaxmi_Rate_Card_TO_PHOTOGRAPH.png`, png);
  // A synthetic "photo" used only for local development until the real photo exists.
  // It is never used by `npm run seed` once rate-card-photo.jpg is present.
  const meta = await sharp(png).metadata();
  const angled = await sharp(png)
    .rotate(-4, { background: "#6b6259" })
    .resize(Math.round(meta.width! * 0.75))
    .modulate({ brightness: 0.93 })
    .blur(0.6)
    .jpeg({ quality: 72 })
    .toBuffer();
  fs.writeFileSync(`${printDir}/dev-only-synthetic-photo.jpg`, angled);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
}
