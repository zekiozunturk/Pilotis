import "server-only";
import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Belge içeriği — render'dan bağımsız, hash'lenebilir yapı */
export interface DocSection {
  heading: string;
  kv?: [string, string][];
  table?: { cols: string[]; widths: number[]; rows: string[][] };
  paragraph?: string;
  signatures?: string[];
}
export interface DocSpec {
  docType: string;
  title: string;
  subtitle: string;
  meta: [string, string][];
  sections: DocSection[];
  isDemo: boolean;
  footnotes?: string[];
}

const A4 = { w: 595.28, h: 841.89 };
const M = 42;
const NAVY = rgb(0.043, 0.176, 0.42);
const ORANGE = rgb(0.91, 0.314, 0.102);
const GREY = rgb(0.36, 0.4, 0.51);
const LINE = rgb(0.86, 0.89, 0.93);
const ASSETS = path.resolve(process.cwd(), "assets");

let cache: { reg: Buffer; bold: Buffer; mono: Buffer; logo: Buffer } | null = null;
function assets() {
  cache ??= {
    reg: readFileSync(path.join(ASSETS, "fonts/DejaVuSans.ttf")),
    bold: readFileSync(path.join(ASSETS, "fonts/DejaVuSans-Bold.ttf")),
    mono: readFileSync(path.join(ASSETS, "fonts/DejaVuSansMono.ttf")),
    logo: readFileSync(path.join(ASSETS, "pilotis-logo-pdf.png")),
  };
  return cache;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const cand = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(cand, size) <= maxW) { line = cand; continue; }
      if (line) out.push(line);
      // tek kelime sığmıyorsa harf bazında böl
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxW) {
        let i = w.length; while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxW) i--;
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

export interface RenderContext { operator: { name: string; address: string; phone: string; email: string }; brand: { slogan: string }; docNo: string; snapshotHash: string; generatedAt: string }

export async function renderPdf(spec: DocSpec, ctx: RenderContext): Promise<Uint8Array> {
  const a = assets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${spec.title} — ${ctx.docNo}`);
  pdf.setAuthor(ctx.operator.name);
  pdf.setCreator("PILOTIS — Pilotage Integrated Logistics, Operations & Tariff Information System");
  pdf.setProducer("PILOTIS");
  const reg = await pdf.embedFont(a.reg, { subset: true });
  const bold = await pdf.embedFont(a.bold, { subset: true });
  const mono = await pdf.embedFont(a.mono, { subset: true });
  const logo = await pdf.embedPng(a.logo);

  let page!: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];
  const contentW = A4.w - 2 * M;

  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    pages.push(page);
    header(page, logo);
    y = A4.h - 118;
    if (spec.isDemo) {
      page.drawText("ÖRNEK VERİ — RESMÎ BELGE DEĞİLDİR", { x: 110, y: 330, size: 30, font: bold, color: ORANGE, opacity: 0.12, rotate: degrees(35) });
    }
  };
  const header = (p: PDFPage, img: PDFImage) => {
    const lw = 128, lh = (img.height / img.width) * lw;
    p.drawImage(img, { x: M, y: A4.h - M - lh, width: lw, height: lh });
    const rx = A4.w - M;
    const lines: [string, PDFFont, number][] = [[ctx.operator.name, bold, 9.5], [ctx.operator.address, reg, 7.5], [`${ctx.operator.phone} · ${ctx.operator.email}`, reg, 7.5]];
    let yy = A4.h - M - 8;
    for (const [t, f, s] of lines) {
      for (const ln of wrap(t, f, s, 250)) { p.drawText(ln, { x: rx - f.widthOfTextAtSize(ln, s), y: yy, size: s, font: f, color: f === bold ? NAVY : GREY }); yy -= s + 3; }
    }
    p.drawRectangle({ x: M, y: A4.h - 92, width: contentW, height: 2, color: NAVY });
    p.drawRectangle({ x: M, y: A4.h - 92, width: 60, height: 2, color: ORANGE });
  };
  const ensure = (h: number) => { if (y - h < 70) newPage(); };
  const text = (t: string, x: number, size: number, f: PDFFont = reg, color = rgb(0.06, 0.1, 0.2), maxW = contentW) => {
    for (const ln of wrap(t, f, size, maxW)) { ensure(size + 4); page.drawText(ln, { x, y, size, font: f, color }); y -= size + 4; }
  };

  newPage();
  // Başlık bloğu
  text(spec.title.toLocaleUpperCase("tr-TR"), M, 16, bold, NAVY);
  text(spec.subtitle, M, 9, reg, GREY);
  y -= 4;
  // Meta kutusu
  const metaRows = Math.ceil(spec.meta.length / 2);
  const boxH = metaRows * 15 + 12;
  ensure(boxH + 10);
  page.drawRectangle({ x: M, y: y - boxH + 8, width: contentW, height: boxH, color: rgb(0.965, 0.973, 0.988), borderColor: LINE, borderWidth: 0.8 });
  spec.meta.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + 10 + col * (contentW / 2);
    const yy = y - 6 - row * 15;
    page.drawText(k, { x, y: yy, size: 7, font: reg, color: GREY });
    page.drawText(v, { x: x + 92, y: yy, size: 8, font: k.includes("Özet") || k.includes("No") ? mono : bold, color: NAVY });
  });
  y -= boxH + 8;

  for (const sec of spec.sections) {
    ensure(40);
    y -= 6;
    page.drawRectangle({ x: M, y: y - 3, width: 3, height: 12, color: ORANGE });
    page.drawText(sec.heading.toLocaleUpperCase("tr-TR"), { x: M + 9, y, size: 9.5, font: bold, color: NAVY });
    y -= 18;
    if (sec.paragraph) { text(sec.paragraph, M, 8.5); y -= 4; }
    if (sec.kv) {
      for (const [k, v] of sec.kv) {
        const lines = wrap(v || "—", reg, 8.5, contentW - 170);
        ensure(lines.length * 12 + 4);
        page.drawText(k, { x: M, y, size: 8, font: reg, color: GREY });
        lines.forEach((ln, i) => page.drawText(ln, { x: M + 170, y: y - i * 12, size: 8.5, font: reg }));
        y -= lines.length * 12 + 3;
        page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + contentW, y: y + 4 }, thickness: 0.4, color: LINE });
        y -= 3;
      }
    }
    if (sec.table) {
      const { cols, widths, rows } = sec.table;
      const total = widths.reduce((s, w) => s + w, 0);
      const ws = widths.map((w) => (w / total) * contentW);
      const drawHead = () => {
        ensure(18);
        page.drawRectangle({ x: M, y: y - 4, width: contentW, height: 15, color: NAVY });
        let x = M + 4;
        cols.forEach((c, i) => { page.drawText(c, { x, y: y, size: 7.2, font: bold, color: rgb(1, 1, 1) }); x += ws[i]; });
        y -= 16;
      };
      drawHead();
      rows.forEach((r, ri) => {
        const cells = r.map((c, i) => wrap(c || "—", reg, 7.8, ws[i] - 8));
        const h = Math.max(...cells.map((c) => c.length)) * 10.5 + 5;
        if (y - h < 70) { newPage(); drawHead(); }
        if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - h + 9, width: contentW, height: h, color: rgb(0.975, 0.98, 0.99) });
        let x = M + 4;
        cells.forEach((lines, i) => { lines.forEach((ln, li) => page.drawText(ln, { x, y: y - li * 10.5, size: 7.8, font: reg })); x += ws[i]; });
        y -= h;
      });
      if (!rows.length) text("Kayıt yok.", M + 4, 8, reg, GREY);
      y -= 4;
    }
    if (sec.signatures) {
      const n = sec.signatures.length;
      const w = (contentW - (n - 1) * 14) / n;
      ensure(80);
      sec.signatures.forEach((s, i) => {
        const x = M + i * (w + 14);
        page.drawRectangle({ x, y: y - 62, width: w, height: 62, borderColor: LINE, borderWidth: 0.8 });
        page.drawText(s, { x: x + 6, y: y - 10, size: 7.5, font: bold, color: NAVY });
        page.drawText("Ad Soyad / Unvan / İmza / Tarih", { x: x + 6, y: y - 56, size: 6.5, font: reg, color: GREY });
      });
      y -= 72;
    }
  }

  if (spec.footnotes?.length) {
    y -= 6;
    for (const [i, f] of spec.footnotes.entries()) text(`${i + 1}. ${f}`, M, 7, reg, GREY);
  }

  // Altbilgi: tüm sayfalarda
  const n = pages.length;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 52 }, end: { x: A4.w - M, y: 52 }, thickness: 0.6, color: LINE });
    p.drawText(`PILOTIS · ${ctx.brand.slogan}`, { x: M, y: 40, size: 7, font: bold, color: NAVY });
    p.drawText(`Belge: ${ctx.docNo}  ·  Veri özeti: ${ctx.snapshotHash.slice(0, 16)}  ·  Üretim: ${ctx.generatedAt}`, { x: M, y: 30, size: 6.5, font: mono, color: GREY });
    const pg = `Sayfa ${i + 1} / ${n}`;
    p.drawText(pg, { x: A4.w - M - reg.widthOfTextAtSize(pg, 7), y: 40, size: 7, font: reg, color: GREY });
  });

  return pdf.save({ useObjectStreams: true });
}
