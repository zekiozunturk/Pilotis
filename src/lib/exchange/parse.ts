/**
 * Excel/CSV okuma ve değer çözümleme (saf — test edilebilir).
 * Makro çalıştırılmaz; dış bağlantılar takip edilmez; formüllü hücrede Excel'in kaydettiği hesaplanmış değer kullanılır
 * (veya kullanıcı seçimine göre hata verilir); kimlikler metin olarak okunur (baştaki sıfırlar korunur).
 */
export interface RawCell { v: string | number | boolean | Date | null; f?: string; ext?: boolean; err?: string }
export interface Sheet { name: string; rows: RawCell[][] }

export const normHeader = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\*/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function parseCsv(text: string): RawCell[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", "\t", ","].map((d) => [d, (first.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) ?? []).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: RawCell[][] = []; let row: RawCell[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') { q = true; continue; }
    if (c === delim) { row.push({ v: cell }); cell = ""; continue; }
    if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push({ v: cell }); rows.push(row); row = []; cell = ""; continue; }
    cell += c;
  }
  if (cell !== "" || row.length) { row.push({ v: cell }); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c.v ?? "").trim() !== ""));
}

/** exceljs hücre değerini düz değere çevirir */
export function fromExcel(value: unknown): RawCell {
  if (value == null) return { v: null };
  if (value instanceof Date) return { v: value };
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return { v: value };
  const o = value as Record<string, unknown>;
  if ("formula" in o || "sharedFormula" in o) {
    const f = String(o.formula ?? o.sharedFormula ?? "");
    const r = o.result as unknown;
    const ext = /\[[^\]]+\]/.test(f) || /\.xls[xmb]?['!]/i.test(f);
    if (r && typeof r === "object" && "error" in (r as object)) return { v: null, f, ext, err: String((r as { error: string }).error) };
    return { ...fromExcel(r ?? null), f, ext };
  }
  if ("richText" in o) return { v: (o.richText as { text: string }[]).map((x) => x.text).join("") };
  if ("text" in o && "hyperlink" in o) return { v: String(o.text) };
  if ("error" in o) return { v: null, err: String(o.error) };
  return { v: String(value) };
}

export type ParseResult<T> = { ok: true; value: T; warn?: string } | { ok: false; error: string };
const CUR: Record<string, string> = { "₺": "TRY", tl: "TRY", try: "TRY", ytl: "TRY", "$": "USD", usd: "USD", "€": "EUR", eur: "EUR" };

/** Sayı: "1.234,56" · "1,234.56" · "1234,5" · "1 234,5" · "1.250,00 TL" · "USD 1,250.00" · Excel sayısı */
export function parseNumber(v: RawCell["v"], expectCurrency?: string): ParseResult<{ n: number; currency?: string }> {
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, value: { n: v } } : { ok: false, error: "Geçersiz sayı" };
  if (v == null || v === "") return { ok: false, error: "Boş" };
  let s = String(v).trim();
  let currency: string | undefined;
  const cm = s.match(/(₺|\$|€|\b(?:TL|TRY|YTL|USD|EUR)\b)/i);
  if (cm) { currency = CUR[cm[1].toLowerCase()]; s = s.replace(cm[0], "").trim(); }
  if (expectCurrency && currency && currency !== expectCurrency) return { ok: false, error: `Para birimi ${currency}; bu kolon ${expectCurrency} bekliyor` };
  s = s.replace(/\s| /g, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()]/g, "").replace(/^[-+]/, "");
  if (!/^[\d.,]+$/.test(s)) return { ok: false, error: `Sayı okunamadı: “${v}”` };
  let warn: string | undefined;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let norm: string;
  if (lastDot >= 0 && lastComma >= 0) norm = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma >= 0) { const parts = s.split(","); norm = parts.length > 2 ? s.replace(/,/g, "") : s.replace(",", "."); }
  else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2) norm = s.replace(/\./g, "");             // 1.234.567
    else if (parts[1].length === 3) { norm = s.replace(".", ""); warn = `“${v}” binlik ayırıcı kabul edildi (${norm}); ondalık ise virgül kullanın`; }
    else norm = s;
  } else norm = s;
  const n = Number(norm) * (neg ? -1 : 1);
  if (!Number.isFinite(n)) return { ok: false, error: `Sayı okunamadı: “${v}”` };
  return { ok: true, value: { n, currency }, warn };
}

const TZ_H = 3;
/** Tarih/saat (Europe/Istanbul): "22.10.2026", "22.10.2026 14:30", "2026-10-22", "2026-10-22T14:30", "22/10/2026", Excel tarih hücresi veya seri numarası */
export function parseDate(v: RawCell["v"], withTime = false): ParseResult<number> {
  if (v == null || v === "") return { ok: false, error: "Boş" };
  if (v instanceof Date) {
    // exceljs tarihleri UTC "duvar saati" olarak verir → yerel saat olarak yorumla
    const ms = Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes()) - TZ_H * 3_600_000;
    return { ok: true, value: ms };
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) { const ms = Math.round((v - 25569) * 86_400_000) - TZ_H * 3_600_000; return { ok: true, value: ms }; }
    return { ok: false, error: `Tarih değil: ${v}` };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  let y: number, mo: number, d: number, h = 0, mi = 0;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (m[4]) { h = +m[4]; mi = +m[5]; } }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; if (m[4]) { h = +m[4]; mi = +m[5]; } }
  else return { ok: false, error: `Tarih biçimi tanınmadı: “${s}” (gg.aa.yyyy veya yyyy-aa-gg)` };
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return { ok: false, error: `Geçersiz tarih: “${s}”` };
  const ms = Date.UTC(y, mo - 1, d, h, mi) - TZ_H * 3_600_000;
  const back = new Date(ms + TZ_H * 3_600_000);
  if (back.getUTCDate() !== d) return { ok: false, error: `Takvimde olmayan tarih: “${s}”` };
  if (withTime && !m[4] && !(m[4] ?? "").length) return { ok: true, value: ms, warn: "Saat yok — 00:00 kabul edildi" };
  return { ok: true, value: ms };
}
export function parseBool(v: RawCell["v"]): ParseResult<boolean> {
  if (typeof v === "boolean") return { ok: true, value: v };
  const s = String(v ?? "").trim().toLocaleLowerCase("tr");
  if (["evet", "e", "1", "true", "doğru", "var", "x", "✓"].includes(s)) return { ok: true, value: true };
  if (["hayır", "hayir", "h", "0", "false", "yanlış", "yok"].includes(s)) return { ok: true, value: false };
  return { ok: false, error: `Evet/Hayır bekleniyor: “${v}”` };
}
/** Kimlik/metin: sayıya çevrilmiş kimliklerde baştaki sıfır kaybı uyarısı */
export function asText(v: RawCell["v"], opts: { pad?: number } = {}): ParseResult<string> {
  if (v == null) return { ok: false, error: "Boş" };
  if (v instanceof Date) return { ok: true, value: new Date(v.getTime()).toISOString().slice(0, 10) };
  if (typeof v === "number") {
    const s = Number.isInteger(v) ? String(v) : String(v);
    if (opts.pad && s.length < opts.pad) return { ok: true, value: s.padStart(opts.pad, "0"), warn: `Sayı biçimli hücre — baştaki sıfırlar tamamlandı (${s} → ${s.padStart(opts.pad, "0")}); kimlik kolonlarını metin biçiminde tutun` };
    return { ok: true, value: s };
  }
  return { ok: true, value: String(v).trim() };
}
/** IMO numarası denetim hanesi */
export function imoValid(s: string) { if (!/^\d{7}$/.test(s)) return false; const d = s.split("").map(Number); return (d[0] * 7 + d[1] * 6 + d[2] * 5 + d[3] * 4 + d[4] * 3 + d[5] * 2) % 10 === d[6]; }
/** Vergi kimlik no (10 hane) denetimi — TCKN (11) ayrı tutulur ve bu kolona kabul edilmez */
export function vknValid(s: string) {
  if (!/^\d{10}$/.test(s)) return false;
  const d = s.split("").map(Number); let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i] + 9 - i) % 10;
    let v = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}
