import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import path from "node:path";

const A4L = { w: 841.89, h: 595.28 };
const M = 32;
const NAVY = rgb(0.043, 0.176, 0.42), GREY = rgb(0.36, 0.4, 0.51), LINE = rgb(0.86, 0.89, 0.93), ZEBRA = rgb(0.97, 0.98, 0.99);
const ASSETS = path.resolve(process.cwd(), "assets");

export interface PdfTable { title: string; description?: string; footnote?: string; logo: boolean; meta: [string, string][]; columns: { label: string; numeric: boolean }[]; rows: string[][]; totals?: string[] | null; chart?: { label: string; value: number }[] }

function fit(text: string, font: PDFFont, size: number, maxW: number) {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let s = text; while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
  return s + "…";
}

/** Rapor PDF'i — tablo sayfalara bölünür, başlık satırı her sayfada tekrarlanır */
export async function tablePdf(t: PdfTable): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(readFileSync(path.join(ASSETS, "fonts/DejaVuSans.ttf")), { subset: true });
  const bold = await doc.embedFont(readFileSync(path.join(ASSETS, "fonts/DejaVuSans-Bold.ttf")), { subset: true });
  const logo = t.logo ? await doc.embedPng(readFileSync(path.join(ASSETS, "pilotis-logo-pdf.png"))) : null;
  doc.setTitle(t.title); doc.setCreator("PILOTIS"); doc.setProducer("PILOTIS rapor tasarımcısı");
  const size = 8, rowH = 14, usable = A4L.w - 2 * M;
  // Kolon genişlikleri: içerik uzunluğuna göre, sınırlı
  const est = t.columns.map((c, i) => Math.min(220, Math.max(46, Math.max(bold.widthOfTextAtSize(c.label, size), ...t.rows.slice(0, 200).map((r) => reg.widthOfTextAtSize(r[i] ?? "", size))) + 10)));
  const k = Math.min(1, usable / est.reduce((s, w) => s + w, 0));
  const widths = est.map((w) => w * k);
  let page: PDFPage = doc.addPage([A4L.w, A4L.h]), y = A4L.h - M, pageNo = 1;
  const header = () => {
    if (logo) { const s = 22 / logo.height; page.drawImage(logo, { x: M, y: y - 22, width: logo.width * s, height: 22 }); }
    page.drawText(t.title, { x: M + (logo ? 110 : 0), y: y - 16, size: 14, font: bold, color: NAVY });
    y -= 30;
  };
  const tableHead = () => {
    let x = M;
    page.drawRectangle({ x: M, y: y - rowH + 3, width: usable * Math.min(1, widths.reduce((s, w) => s + w, 0) / usable), height: rowH, color: NAVY });
    t.columns.forEach((c, i) => { const txt = fit(c.label, bold, size, widths[i] - 6); const w = bold.widthOfTextAtSize(txt, size); page.drawText(txt, { x: c.numeric ? x + widths[i] - 4 - w : x + 3, y: y - 7, size, font: bold, color: rgb(1, 1, 1) }); x += widths[i]; });
    y -= rowH;
  };
  const footer = () => page.drawText(`PILOTIS · ${t.meta.find((m) => m[0] === "Rapor kimliği")?.[1] ?? ""} · sayfa ${pageNo}`, { x: M, y: 16, size: 7, font: reg, color: GREY });
  header();
  if (t.description) { for (const line of wrapText(t.description, reg, 9, usable)) { page.drawText(line, { x: M, y, size: 9, font: reg, color: GREY }); y -= 12; } y -= 4; }
  for (const [k2, v] of t.meta) { page.drawText(`${k2}: `, { x: M, y, size: 7.5, font: bold, color: GREY }); page.drawText(fit(v, reg, 7.5, usable - 110), { x: M + 105, y, size: 7.5, font: reg, color: GREY }); y -= 10; }
  y -= 8;
  // Basit çubuk grafik (ilk ölçüm, en fazla 15 grup)
  if (t.chart?.length) {
    const top = t.chart.slice(0, 15), max = Math.max(1, ...top.map((c) => Math.abs(c.value)));
    for (const c of top) {
      page.drawText(fit(c.label, reg, 7.5, 150), { x: M, y: y - 7, size: 7.5, font: reg, color: rgb(0.06, 0.1, 0.2) });
      const w = (Math.abs(c.value) / max) * (usable - 260);
      page.drawRectangle({ x: M + 160, y: y - 9, width: Math.max(1, w), height: 8, color: rgb(0.165, 0.47, 0.84) });
      page.drawText(c.value.toLocaleString("tr-TR", { maximumFractionDigits: 1 }), { x: M + 166 + w, y: y - 8, size: 7.5, font: reg, color: GREY });
      y -= 12;
    }
    y -= 8;
  }
  tableHead();
  const all = t.totals ? [...t.rows, t.totals] : t.rows;
  all.forEach((r, ri) => {
    if (y < M + 30) { footer(); page = doc.addPage([A4L.w, A4L.h]); pageNo++; y = A4L.h - M; header(); tableHead(); }
    const isTotal = t.totals && ri === all.length - 1;
    if (ri % 2 === 1 && !isTotal) page.drawRectangle({ x: M, y: y - rowH + 3, width: widths.reduce((s, w) => s + w, 0), height: rowH, color: ZEBRA });
    if (isTotal) page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + widths.reduce((s, w) => s + w, 0), y: y + 3 }, thickness: 0.8, color: NAVY });
    let x = M;
    r.forEach((v, i) => { const f = isTotal ? bold : reg; const txt = fit(v ?? "", f, size, widths[i] - 6); const w = f.widthOfTextAtSize(txt, size); page.drawText(txt, { x: t.columns[i]?.numeric ? x + widths[i] - 4 - w : x + 3, y: y - 7, size, font: f, color: rgb(0.06, 0.1, 0.2) }); x += widths[i]; });
    page.drawLine({ start: { x: M, y: y - rowH + 3 }, end: { x: M + widths.reduce((s, w) => s + w, 0), y: y - rowH + 3 }, thickness: 0.3, color: LINE });
    y -= rowH;
  });
  if (t.footnote) { y -= 8; for (const line of wrapText(t.footnote, reg, 7.5, usable)) { if (y < M) { footer(); page = doc.addPage([A4L.w, A4L.h]); pageNo++; y = A4L.h - M; } page.drawText(line, { x: M, y, size: 7.5, font: reg, color: GREY }); y -= 10; } }
  footer();
  return doc.save();
}
function wrapText(text: string, font: PDFFont, size: number, maxW: number) {
  const out: string[] = []; let line = "";
  for (const w of text.split(/\s+/)) { const c = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(c, size) <= maxW) line = c; else { if (line) out.push(line); line = w; } }
  if (line) out.push(line);
  return out;
}
