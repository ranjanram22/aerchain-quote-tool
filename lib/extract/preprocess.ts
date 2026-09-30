// Turns each uploaded file into model input. Spreadsheets become text grids
// with cell references and Word files numbered paragraphs, so provenance can
// cite exact locations. PDFs and images go to the vision model as-is.
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import sharp from "sharp";
import heicConvert from "heic-convert";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";

export interface InputFile {
  id: string;
  filename: string;
  mime: string | null;
  data: Buffer;
}

export type FileKind = "spreadsheet" | "docx" | "pdf" | "image" | "text" | "unsupported";

export function kindOf(filename: string, mime: string | null): FileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (["xlsx", "xls", "csv", "xlsm", "ods"].includes(ext)) return "spreadsheet";
  if (ext === "docx") return "docx";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "heic", "heif"].includes(ext) || mime?.startsWith("image/")) return "image";
  if (["txt", "eml", "text", "md"].includes(ext) || mime?.startsWith("text/")) return "text";
  return "unsupported";
}

function sheetToGrid(buf: Buffer, filename: string): string {
  const isCsv = filename.toLowerCase().endsWith(".csv");
  const wb = isCsv ? XLSX.read(buf.toString("utf8"), { type: "string" }) : XLSX.read(buf, { type: "buffer" });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    if (!ref) continue;
    out.push(`--- Sheet "${name}" ---`);
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell || cell.v === undefined || cell.v === "") continue;
        // Show the formatted value (what a human sees) and the raw number if different.
        const shown = cell.w ?? String(cell.v);
        const raw = typeof cell.v === "number" && String(cell.v) !== shown ? ` (raw ${cell.v})` : "";
        cells.push(`${name}!${addr}: ${shown}${raw}`);
      }
      if (cells.length) out.push(cells.join(" | "));
    }
  }
  return out.join("\n");
}

async function docxToParagraphs(buf: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => `¶${i + 1}: ${p}`)
    .join("\n");
}

export async function heicToJpeg(data: Buffer): Promise<Buffer> {
  const out = await heicConvert({ buffer: new Uint8Array(data), format: "JPEG", quality: 0.9 });
  return Buffer.from(out as unknown as ArrayBuffer);
}

async function imageToDataUrl(f: InputFile): Promise<string> {
  // iPhone photos (HEIC/HEIF) are converted first; then every image is
  // normalised to a JPEG ≤ 2000 px on the long side.
  const src = /\.(heic|heif)$/i.test(f.filename) || f.mime === "image/heic" || f.mime === "image/heif" ? await heicToJpeg(f.data) : f.data;
  const jpg = await sharp(src).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

export async function toContentParts(files: InputFile[], emailText: string | null): Promise<{ parts: ChatCompletionContentPart[]; hasImage: boolean; problems: string[] }> {
  const parts: ChatCompletionContentPart[] = [];
  const problems: string[] = [];
  let hasImage = false;
  if (emailText?.trim()) {
    parts.push({ type: "text", text: `=== EMAIL BODY (file name for provenance: "email body") ===\n${emailText.trim()}` });
  }
  for (const f of files) {
    const k = kindOf(f.filename, f.mime);
    const header = `=== FILE "${f.filename}" (${k}) ===`;
    try {
      if (k === "spreadsheet") parts.push({ type: "text", text: `${header}\nCells are listed as Sheet!Cell: value. Cite these references in provenance.locator.\n${sheetToGrid(f.data, f.filename)}` });
      else if (k === "docx") parts.push({ type: "text", text: `${header}\nParagraphs are numbered ¶N. Cite 'paragraph N' in provenance.locator.\n${await docxToParagraphs(f.data)}` });
      else if (k === "text") parts.push({ type: "text", text: `${header}\n${f.data.toString("utf8")}` });
      else if (k === "pdf") {
        parts.push({ type: "text", text: `${header}\nCite 'page N' (and table row if relevant) in provenance.locator.` });
        parts.push({ type: "file", file: { filename: f.filename, file_data: `data:application/pdf;base64,${f.data.toString("base64")}` } } as ChatCompletionContentPart);
      } else if (k === "image") {
        hasImage = true;
        parts.push({ type: "text", text: `${header}\nThis is a photo or scan. Report skew, blur, glare or cut-off areas in image_quality. Cite 'photo, row N' or the printed row number in provenance.locator.` });
        parts.push({ type: "image_url", image_url: { url: await imageToDataUrl(f), detail: "high" } });
      } else {
        problems.push(`${f.filename}: file type not supported`);
        parts.push({ type: "text", text: `${header}\n(File type not supported; not readable.)` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      problems.push(`${f.filename}: could not be read (${msg.slice(0, 120)})`);
      parts.push({ type: "text", text: `${header}\n(This file could not be opened: ${msg.slice(0, 120)})` });
    }
  }
  return { parts, hasImage, problems };
}
