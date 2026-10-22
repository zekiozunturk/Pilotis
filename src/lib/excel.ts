import "server-only";
/**
 * Excel çıktısı — ortak üretici.
 * - Anlamlı sayfa adları, sabitlenmiş başlık satırı, otomatik filtre, uygun kolon genişlikleri.
 * - Doğru hücre tipleri: tarih → Excel tarihi, sayı/para → sayı (biçimli); kimlikler METİN (baştaki sıfır korunur).
 * - Kullanıcı kaynaklı metin formül olarak çalışmaz (=, +, -, @, sekme, CR ile başlayan değerler ' ile kaçırılır).
 * - Her dosyada "Bilgi" sayfası: rapor kimliği, üretim zamanı, hazırlayan, filtreler, tarih esası, veri güncelliği, yöntem.
 */
import ExcelJS from "exceljs";
import { createId } from "./id";

export type ColType = "text" | "id" | "int" | "number" | "money" | "hours" | "pct" | "date" | "datetime";
export interface Col { key: string; header: string; type: ColType; width?: number; total?: boolean; note?: string }
export interface Sheet { name: string; columns: Col[]; rows: Record<string, unknown>[]; totals?: boolean; groupBy?: string; caption?: string }
export interface Workbook { title: string; meta: [string, string][]; sheets: Sheet[]; preparedBy: string }

const FORMULA = /^[=+\-@\t\r]/;
export const safeText = (v: unknown) => { const s = v == null ? "" : String(v); return FORMULA.test(s) ? `'${s}` : s; };
const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
const NUMFMT: Partial<Record<ColType, string>> = { int: "#,##0", number: "#,##0.00", money: '#,##0.00 "TL"', hours: "#,##0.0", pct: "0.0%", date: "dd.mm.yyyy", datetime: "dd.mm.yyyy hh:mm" };

/** Europe/Istanbul yerel saatini Excel'e "duvar saati" olarak yazar (Excel saat dilimi tutmaz) */
const excelDate = (ms: number) => new Date(ms + 3 * 3_600_000);

export async function buildWorkbook(w: Workbook): Promise<{ buffer: Buffer; reportId: string }> {
  const wb = new ExcelJS.Workbook();
  const reportId = `RPR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${createId().slice(0, 8).toUpperCase()}`;
  wb.creator = "PILOTIS"; wb.created = new Date(); wb.title = w.title;
  const info = wb.addWorksheet("Bilgi", { properties: { tabColor: { argb: "FF0B2D6B" } } });
  info.columns = [{ width: 30 }, { width: 100 }];
  info.addRow([w.title]).font = { bold: true, size: 14 };
  const meta: [string, string][] = [["Rapor kimliği", reportId], ["Üretim zamanı", new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })], ["Hazırlayan", w.preparedBy], ...w.meta, ["Saat dilimi", "Europe/Istanbul (tarih/saat hücreleri yerel saattir)"], ["Para birimi", "TL — faturalar TL kesilir; farklı para birimleri doğrudan toplanmaz"]];
  for (const [k, v] of meta) { const r = info.addRow([k, safeText(v)]); r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true, vertical: "top" }; }
  for (const sh of w.sheets) {
    const ws = wb.addWorksheet(sheetName(sh.name), { views: [{ state: "frozen", ySplit: sh.caption ? 2 : 1 }] });
    if (sh.caption) { const c = ws.addRow([sh.caption]); c.font = { italic: true, color: { argb: "FF5B6782" } }; ws.mergeCells(1, 1, 1, Math.max(1, sh.columns.length)); }
    const head = ws.addRow(sh.columns.map((c) => c.header));
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2D6B" } }; cell.alignment = { vertical: "middle", wrapText: true }; });
    const rows = sh.groupBy ? [...sh.rows].sort((a, b) => String(a[sh.groupBy!] ?? "").localeCompare(String(b[sh.groupBy!] ?? ""), "tr")) : sh.rows;
    let lastGroup: unknown = Symbol(); let groupStart = -1;
    const flushGroup = (endRow: number) => {
      if (!sh.groupBy || groupStart < 0 || !sh.columns.some((c) => c.total)) return;
      const r = ws.addRow(sh.columns.map((c, i) => (i === 0 ? `Alt toplam — ${String(lastGroup ?? "")}` : c.total ? { formula: `SUBTOTAL(9,${colL(i)}${groupStart}:${colL(i)}${endRow})` } : null)));
      r.font = { italic: true, bold: true };
    };
    for (const row of rows) {
      if (sh.groupBy && row[sh.groupBy] !== lastGroup) { if (groupStart > 0) flushGroup(ws.rowCount); lastGroup = row[sh.groupBy]; groupStart = ws.rowCount + 1; }
      ws.addRow(sh.columns.map((c) => cellValue(row[c.key], c.type)));
    }
    if (sh.groupBy && groupStart > 0) flushGroup(ws.rowCount);
    const firstData = (sh.caption ? 2 : 1) + 1, lastData = ws.rowCount;
    if (sh.totals !== false && sh.columns.some((c) => c.total) && lastData >= firstData) {
      const t = ws.addRow(sh.columns.map((c, i) => (i === 0 ? "Genel toplam" : c.total ? { formula: `SUBTOTAL(9,${colL(i)}${firstData}:${colL(i)}${lastData})` } : null)));
      t.font = { bold: true }; t.eachCell((cell) => { cell.border = { top: { style: "thin" } }; });
    }
    sh.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (NUMFMT[c.type]) col.numFmt = NUMFMT[c.type]!;
      const longest = Math.max(c.header.length, ...rows.slice(0, 300).map((r) => String(r[c.key] ?? "").length));
      col.width = c.width ?? Math.min(60, Math.max(10, longest + 2));
      if (c.type === "id") col.numFmt = "@";
      if (c.type === "id" || c.type === "text") col.alignment = { vertical: "top" };
      if (c.note) head.getCell(i + 1).note = c.note;
    });
    ws.autoFilter = { from: { row: sh.caption ? 2 : 1, column: 1 }, to: { row: sh.caption ? 2 : 1, column: sh.columns.length } };
  }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, reportId };
}
function cellValue(v: unknown, t: ColType): ExcelJS.CellValue {
  if (v == null || v === "") return null;
  switch (t) {
    case "id": return safeText(String(v)); // metin olarak yazılır — sayıya çevrilmez, baştaki sıfır korunur
    case "text": return safeText(v);
    case "date": case "datetime": return typeof v === "number" ? excelDate(v) : v instanceof Date ? excelDate(v.getTime()) : safeText(v);
    default: { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : safeText(v); }
  }
}
const colL = (i: number) => { let s = "", n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export function xlsxResponse(buffer: Buffer, fileName: string) {
  return new Response(new Uint8Array(buffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`, "cache-control": "no-store" } });
}
