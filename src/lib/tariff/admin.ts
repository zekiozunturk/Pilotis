/** Tarife yönetimi: endeksle türetme, sürüm farkı, karşılaştırma matrisi — saf fonksiyonlar (test edilebilir). */
import Decimal from "decimal.js";
import type { TariffDefinition, ServiceTariff, TariffVersionInput, ServiceKind } from "./types";
import { calculate } from "./engine";

export type Rounding = "NONE" | "CENT" | "UNIT";

function round(v: Decimal, r: Rounding): string {
  if (r === "UNIT") return v.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
  if (r === "CENT") return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
  return v.toString();
}

function scaleService(s: ServiceTariff, f: Decimal, r: Rounding): ServiceTariff {
  return {
    ...s,
    bands: s.bands.map((b) => ({ ...b, base: round(new Decimal(b.base).times(f), r), ...(b.perBlock ? { perBlock: round(new Decimal(b.perBlock).times(f), r) } : {}) })),
    ...(s.bollardBands ? { bollardBands: s.bollardBands.map((b) => ({ ...b, rate: round(new Decimal(b.rate).times(f), r) })) } : {}),
  };
}

/**
 * Yönerge md.5(1)(b): ücretler her yıl ABD TÜFE oranında artırılır.
 * Oran ve yuvarlama yöntemi kullanıcıdan gelir; oran negatifse önceki ücretler aynen kalır.
 * Oranlar (artırım/indirim yüzdeleri) endekslenmez.
 */
export function deriveByIndex(def: TariffDefinition, ratePct: string, rounding: Rounding, indexNote: string, indexCurrencies: string[] = ["USD"]): TariffDefinition {
  const pct = new Decimal(ratePct);
  const f = pct.isNegative() ? new Decimal(1) : new Decimal(1).plus(pct.div(100));
  const scaleMap = <T extends Partial<Record<ServiceKind, ServiceTariff>>>(m: T): T =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, scaleService(v as ServiceTariff, f, rounding)])) as T;
  const notes = (def.verificationNotes ?? []).map((n) => ({ ...n }));
  notes.push({ id: `VN-IDX`, text: `Endeks: ${pct.toString()}% (${indexNote}); yuvarlama: ${rounding}; yalnız ${indexCurrencies.join("/")} sabit fiyatlı kalemler endekslendi, formüller değişmedi. Oran ve yuvarlama resmî DGM duyurusuyla doğrulanmalı.${pct.isNegative() ? " Oran negatif → ücretler değiştirilmedi." : ""}`, resolved: false });
  return {
    ...def,
    services: scaleMap(def.services),
    ...(def.categories ? { categories: Object.fromEntries(Object.entries(def.categories).map(([k, c]) => [k, { ...c, services: scaleMap(c.services) }])) } : {}),
    ...(def.items ? { items: def.items.map((it) => (it.price && !it.formula && indexCurrencies.includes(it.currency) ? { ...it, price: round(new Decimal(it.price).times(f), rounding) } : { ...it })) } : {}),
    verificationNotes: notes,
  };
}

export interface CellDiff { path: string; label: string; from: string | null; to: string | null; changePct: string | null }

function flatten(def: TariffDefinition): Map<string, { label: string; value: string }> {
  const m = new Map<string, { label: string; value: string }>();
  const addSvc = (prefix: string, catLabel: string, svcs: Partial<Record<string, ServiceTariff>>) => {
    for (const [k, s] of Object.entries(svcs)) {
      if (!s) continue;
      s.bands.forEach((b, i) => {
        m.set(`${prefix}.${k}.b${i}.base`, { label: `${catLabel} · ${k} · taban`, value: b.base });
        if (b.perBlock) m.set(`${prefix}.${k}.b${i}.perBlock`, { label: `${catLabel} · ${k} · +1000 GT`, value: b.perBlock });
      });
      s.bollardBands?.forEach((b) => m.set(`${prefix}.${k}.bp${b.fromT}`, { label: `${catLabel} · ${k} · ${b.fromT}–${b.toT ?? "∞"} t`, value: b.rate }));
      if (s.gtCap) m.set(`${prefix}.${k}.cap`, { label: `${catLabel} · ${k} · GT tavanı`, value: String(s.gtCap) });
    }
  };
  addSvc("_", "Genel", def.services);
  for (const [ck, c] of Object.entries(def.categories ?? {})) addSvc(ck, c.label, c.services);
  for (const it of def.items ?? []) m.set(`item.${it.code}`, { label: `[${it.code}] ${it.name} (${it.currency})`, value: it.formula?.trim() ? `=${it.formula}` : String(it.price) });
  for (const a of def.adjustments) m.set(`adj.${a.code}`, { label: `${a.kind === "SURCHARGE" ? "Artırım" : "İndirim"} · ${a.label}`, value: a.rate });
  return m;
}

export function diffDefinitions(a: TariffDefinition, b: TariffDefinition): CellDiff[] {
  const fa = flatten(a), fb = flatten(b);
  const keys = [...new Set([...fa.keys(), ...fb.keys()])];
  const out: CellDiff[] = [];
  for (const k of keys) {
    const x = fa.get(k)?.value ?? null, y = fb.get(k)?.value ?? null;
    if (x === y) continue;
    const numeric = (z: string | null) => z !== null && /^-?\d+(\.\d+)?$/.test(z);
    const pct = numeric(x) && numeric(y) && Number(x) !== 0 ? new Decimal(y!).minus(x!).div(x!).times(100).toDecimalPlaces(2).toString() : null;
    out.push({ path: k, label: (fb.get(k) ?? fa.get(k))!.label, from: x, to: y, changePct: pct });
  }
  return out;
}

export const MATRIX_GTS = [1000, 3000, 8000, 15000, 30000, 60000, 120000];

/** Karşılaştırma matrisi: aynı GT ve kategori için iki sürümün esas tutarları (artırım/indirimsiz). */
export function compareMatrix(a: TariffVersionInput, b: TariffVersionInput, kind: "PILOTAGE" | "TOWAGE" | "MOORING") {
  const cats = [...new Set([...Object.keys(a.definition.categories ?? { _: 0 }), ...Object.keys(b.definition.categories ?? { _: 0 })])];
  const run = (v: TariffVersionInput, cat: string, gt: number) => {
    const r = calculate({ operationRef: "CMP", serviceKind: kind, serviceDate: v.validFrom, gt, measuredMinutes: 60, allocatedUnits: 1, requestedUnits: 1, extraUnitsWrittenRequest: false, conditionCodes: [], completion: "COMPLETED", tariffCategory: cat === "_" ? null : cat }, v);
    return r.missing.length ? null : r.netAmount;
  };
  return cats.map((cat) => ({
    category: cat,
    label: b.definition.categories?.[cat]?.label ?? a.definition.categories?.[cat]?.label ?? "Genel",
    rows: MATRIX_GTS.map((gt) => {
      const x = run(a, cat, gt), y = run(b, cat, gt);
      return { gt, a: x, b: y, pct: x && y && Number(x) ? new Decimal(y).minus(x).div(x).times(100).toDecimalPlaces(2).toString() : null };
    }),
  }));
}

/** Onay ön koşulları */
export function approvalBlockers(v: { definition: TariffDefinition; isDemo: boolean }, refResults: { pass: boolean }[], minCases = 5): string[] {
  const out: string[] = [];
  if (v.isDemo) out.push("ÖRNEK sürüm onaylanamaz");
  const open = (v.definition.verificationNotes ?? []).filter((n) => !n.resolved);
  if (open.length) out.push(`${open.length} çözülmemiş doğrulama notu`);
  if (refResults.length < minCases) out.push(`En az ${minCases} referans vaka gerekli (mevcut ${refResults.length})`);
  const fail = refResults.filter((r) => !r.pass).length;
  if (fail) out.push(`${fail} referans vaka başarısız`);
  return out;
}

export function overlaps(a: { validFrom: Date | string; validTo: Date | string }, b: { validFrom: Date | string; validTo: Date | string }): boolean {
  return new Date(a.validFrom) <= new Date(b.validTo) && new Date(b.validFrom) <= new Date(a.validTo);
}

/**
 * Fiyat listesi → hizmet eşlemesi. Hizmet (ve isteğe bağlı kategori) atanmış kalemler motorun ücretlendirdiği kalemlerdir.
 * Kategoriye özel kalem, kategorisiz (tüm kategoriler) kalemden önceliklidir. Aynı hizmet+kategori için iki kalem hatadır.
 */
export function syncServicesFromItems(def: TariffDefinition): { def: TariffDefinition; issues: string[] } {
  const items = def.items ?? [];
  const issues: string[] = [];
  const out: TariffDefinition = structuredClone(def);
  const svcItems = items.filter((i) => i.serviceKind);
  const seen = new Set<string>();
  for (const it of svcItems) {
    const k = `${it.serviceKind}|${it.category ?? "*"}`;
    if (seen.has(k)) issues.push(`${it.serviceKind}${it.category ? ` / ${it.category}` : ""} için birden fazla hizmet kalemi var ([${it.code}])`);
    seen.add(k);
    if (it.category && def.categories && !def.categories[it.category]) issues.push(`[${it.code}] bilinmeyen kategori ${it.category}`);
  }
  const mk = (kind: string, code: string, prev?: ServiceTariff): ServiceTariff => {
    const it = items.find((i) => i.code === code)!;
    const hourly = /saat/i.test(it.unit) || kind === "STANDBY_TUG";
    return { ...(prev ?? { ruleCodes: ["R-009", "R-001"], bands: [] }), bands: [], itemCode: code, unit: hourly ? "HOUR" : "EVENT", pricing: kind === "STANDBY_TUG" ? "BOLLARD_PULL" : "GT_BANDS",
      ...(hourly ? { rounding: prev?.rounding ?? { mode: "CEIL_HOUR", minimumHours: 1 } } : {}), gtCap: prev?.gtCap ?? (kind === "STANDBY_TUG" ? undefined : 120000) } as ServiceTariff;
  };
  const kinds = [...new Set(svcItems.map((i) => i.serviceKind!))];
  if (out.categories && Object.keys(out.categories).length) {
    for (const [ck, c] of Object.entries(out.categories)) {
      const next: Partial<Record<ServiceKind, ServiceTariff>> = {};
      for (const kind of kinds) {
        const it = svcItems.find((i) => i.serviceKind === kind && i.category === ck) ?? svcItems.find((i) => i.serviceKind === kind && !i.category);
        if (it) next[kind as ServiceKind] = mk(kind, it.code, c.services[kind as ServiceKind]);
      }
      // kalemle tanımlanmamış eski (kademeli) hizmetler korunur
      for (const [k, sv] of Object.entries(c.services)) if (!next[k as ServiceKind] && sv && !sv.itemCode) next[k as ServiceKind] = sv;
      c.services = next;
    }
  } else if (svcItems.length) {
    const next: Partial<Record<ServiceKind, ServiceTariff>> = {};
    for (const kind of kinds) { const it = svcItems.find((i) => i.serviceKind === kind && !i.category) ?? svcItems.find((i) => i.serviceKind === kind); if (it) next[kind as ServiceKind] = mk(kind, it.code, out.services[kind as ServiceKind]); }
    for (const [k, sv] of Object.entries(out.services)) if (!next[k as ServiceKind] && sv && !sv.itemCode) next[k as ServiceKind] = sv;
    out.services = next;
  }
  return { def: out, issues };
}
