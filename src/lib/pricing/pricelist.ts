/**
 * Fiyat listesi: tekil kodlu kalemler (200.001), sabit fiyat veya formül, kalem bazında para birimi.
 * Operasyonel para birimi TL'dir; döviz kalemler hesap anındaki kurla TL'ye çevrilir.
 */
import Decimal from "decimal.js";
import { parse, evaluate, refsOf, varsOf, FormulaError, type Node } from "./formula";

export type Currency = "TRY" | "USD" | "EUR";
export const CURRENCIES: Currency[] = ["TRY", "USD", "EUR"];
export const OPERATIONAL_CURRENCY: Currency = "TRY";
export const CODE_RE = /^\d{3}\.\d{3}$/;

export interface PriceItem {
  code: string;            // 200.001
  name: string;
  unit: string;            // Manevra, Saat, Blok (1000 GT), Adet …
  currency: Currency;
  price?: string | null;   // sabit birim fiyat
  formula?: string | null; // veya formül
  serviceKind?: string | null; // motorun ücretlendirdiği hizmet kalemi ise
  category?: string | null;
  note?: string | null;
}

/** Kur tablosu: 1 birim döviz kaç TL (TRY = 1) */
export type FxTable = Partial<Record<Currency, { rate: string; date: string; source: string }>>;

export function fxRate(fx: FxTable, c: Currency): Decimal {
  if (c === "TRY") return new Decimal(1);
  const r = fx[c];
  if (!r) throw new FormulaError(`${c}/TRY kuru yok`);
  return new Decimal(r.rate);
}

/** a para biriminden b'ye çevir (TL üzerinden çapraz) */
export function convert(v: Decimal, from: Currency, to: Currency, fx: FxTable): Decimal {
  if (from === to) return v;
  return v.times(fxRate(fx, from)).div(fxRate(fx, to));
}

export interface ItemIssue { code: string; message: string }

/** Liste doğrulaması: kod biçimi/tekilliği, fiyat-formül, sözdizimi, olmayan kalem, döngü */
export function validatePriceList(items: PriceItem[]): ItemIssue[] {
  const issues: ItemIssue[] = [];
  const byCode = new Map<string, PriceItem>();
  for (const it of items) {
    if (!CODE_RE.test(it.code)) issues.push({ code: it.code, message: "Kod biçimi 000.000 olmalı (ör. 200.001)" });
    if (byCode.has(it.code)) issues.push({ code: it.code, message: "Kod tekrar ediyor" });
    byCode.set(it.code, it);
    if (!it.name?.trim()) issues.push({ code: it.code, message: "Kalem adı boş" });
    if (!CURRENCIES.includes(it.currency)) issues.push({ code: it.code, message: "Para birimi TRY, USD veya EUR olmalı" });
    const hasP = it.price !== null && it.price !== undefined && String(it.price).trim() !== "";
    const hasF = !!it.formula?.trim();
    if (hasP === hasF) issues.push({ code: it.code, message: "Sabit fiyat veya formülden yalnız biri girilmeli" });
    if (hasP && !/^\d+(\.\d+)?$/.test(String(it.price))) issues.push({ code: it.code, message: `Fiyat sayı olmalı (ondalık ayırıcı nokta): "${it.price}"` });
  }
  const graph = new Map<string, string[]>();
  for (const it of items) {
    if (!it.formula?.trim()) continue;
    try {
      const ast = parse(it.formula);
      const refs = [...refsOf(ast)];
      for (const r of refs) if (!byCode.has(r)) issues.push({ code: it.code, message: `[${r}] kalemi listede yok` });
      if (refs.includes(it.code)) issues.push({ code: it.code, message: "Kalem kendine başvuruyor" });
      graph.set(it.code, refs);
    } catch (e) {
      issues.push({ code: it.code, message: `Formül hatası: ${(e as Error).message}` });
    }
  }
  // döngü tespiti
  const state = new Map<string, 1 | 2>();
  const visit = (c: string, path: string[]) => {
    if (state.get(c) === 2) return;
    if (state.get(c) === 1) { issues.push({ code: c, message: `Döngüsel başvuru: ${[...path, c].join(" → ")}` }); return; }
    state.set(c, 1);
    for (const r of graph.get(c) ?? []) if (r !== c) visit(r, [...path, c]);
    state.set(c, 2);
  };
  for (const c of graph.keys()) visit(c, []);
  return issues;
}

export interface ItemValue { value: Decimal; currency: Currency; trace: string[] }

/**
 * Kalemin birim değerini kendi para biriminde hesaplar. Başvurulan kalemler bu kalemin para birimine çevrilir.
 * Ara değerler yuvarlanmaz.
 */
export function evaluateItem(items: PriceItem[], code: string, vars: Record<string, Decimal | number | null | undefined>, fx: FxTable): ItemValue {
  const byCode = new Map(items.map((i) => [i.code, i]));
  const cache = new Map<string, Decimal>();
  const asts = new Map<string, Node>();
  const trace: string[] = [];
  const stack: string[] = [];
  const valueOf = (c: string): Decimal => {
    const it = byCode.get(c);
    if (!it) throw new FormulaError(`[${c}] kalemi yok`);
    if (cache.has(c)) return cache.get(c)!;
    if (stack.includes(c)) throw new FormulaError(`Döngüsel başvuru: ${[...stack, c].join(" → ")}`);
    stack.push(c);
    let v: Decimal;
    if (it.formula?.trim()) {
      const ast = asts.get(c) ?? parse(it.formula);
      asts.set(c, ast);
      v = evaluate(ast, {
        vars,
        ref: (rc) => {
          const r = byCode.get(rc);
          if (!r) throw new FormulaError(`[${rc}] kalemi yok`);
          const raw = valueOf(rc);
          if (r.currency !== it.currency) {
            const conv = convert(raw, r.currency, it.currency, fx);
            trace.push(`[${rc}] ${raw.toString()} ${r.currency} → ${conv.toDecimalPlaces(4).toString()} ${it.currency}`);
            return conv;
          }
          return raw;
        },
      });
      trace.push(`[${c}] ${it.formula} = ${v.toDecimalPlaces(4).toString()} ${it.currency}`);
    } else {
      v = new Decimal(String(it.price));
    }
    stack.pop();
    cache.set(c, v);
    return v;
  };
  const it = byCode.get(code);
  if (!it) throw new FormulaError(`[${code}] kalemi yok`);
  return { value: valueOf(code), currency: it.currency, trace };
}

export function usedVariables(items: PriceItem[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const it of items) if (it.formula?.trim()) { try { out[it.code] = [...varsOf(parse(it.formula))]; } catch { out[it.code] = []; } }
  return out;
}

/** Bir kaleme başvuran kalemler (silme kontrolü için) */
export function dependents(items: PriceItem[], code: string): string[] {
  return items.filter((i) => { if (!i.formula?.trim()) return false; try { return refsOf(parse(i.formula)).has(code); } catch { return false; } }).map((i) => i.code);
}
