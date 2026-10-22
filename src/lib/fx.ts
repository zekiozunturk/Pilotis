import "server-only";
import { and, desc, eq, lt, lte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { FxTable, Currency } from "./pricing/pricelist";

/** Kur politikası — mali müşavir onayına tabidir (AK-17) */
export interface FxPolicy { rateType: "FOREX_SELLING" | "FOREX_BUYING"; dateRule: "PREVIOUS_BULLETIN" | "SAME_DAY_BULLETIN"; preferSource: "TCMB" }
export const DEFAULT_FX_POLICY: FxPolicy = { rateType: "FOREX_SELLING", dateRule: "PREVIOUS_BULLETIN", preferSource: "TCMB" };
export const RATE_TYPE_LABEL = { FOREX_SELLING: "döviz satış", FOREX_BUYING: "döviz alış" } as const;
export const DATE_RULE_LABEL = {
  PREVIOUS_BULLETIN: "Hizmet gününden önceki son TCMB bülteni (bülten günü 15:30'da yayımlanır, ertesi gün işlemlerinde kullanılır)",
  SAME_DAY_BULLETIN: "Hizmet günü dahil son TCMB bülteni",
} as const;
export const FX_CURRENCIES: Currency[] = ["USD", "EUR"];

export async function getFxPolicy(): Promise<FxPolicy> {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "fx.policy"));
  return { ...DEFAULT_FX_POLICY, ...((row?.value as Partial<FxPolicy>) ?? {}) };
}

/** Europe/Istanbul takvim günü (UTC+3) */
export function trDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Hizmet anı için kur tablosu. Kur bulunamazsa o döviz tabloya girmez (motor TL karşılığını hesaplamaz; asla varsayılmaz).
 * TCMB kaydı varsa elle girilene tercih edilir.
 */
export async function getFxTable(atIso: string, policy?: FxPolicy): Promise<FxTable> {
  const p = policy ?? (await getFxPolicy());
  const day = trDay(atIso);
  const out: FxTable = {};
  for (const c of FX_CURRENCIES) {
    const cond = p.dateRule === "PREVIOUS_BULLETIN" ? lt(s.exchangeRates.bulletinDate, day) : lte(s.exchangeRates.bulletinDate, day);
    const rows = await db.select().from(s.exchangeRates).where(and(eq(s.exchangeRates.currency, c), cond)).orderBy(desc(s.exchangeRates.bulletinDate)).limit(4);
    const latestDate = rows[0]?.bulletinDate;
    const pick = rows.filter((r) => r.bulletinDate === latestDate).sort((a) => (a.source === "TCMB" ? -1 : 1))[0];
    if (!pick) continue;
    const rate = p.rateType === "FOREX_SELLING" ? pick.forexSelling : pick.forexBuying;
    if (!rate) continue;
    out[c] = { rate: String(Number(rate)), date: pick.bulletinDate, source: `${pick.source === "TCMB" ? "TCMB" : "Elle giriş"}${pick.bulletinNo ? ` ${pick.bulletinNo}` : ""} ${RATE_TYPE_LABEL[p.rateType]}` };
  }
  return out;
}

/** Gösterim (bilgi amaçlı) için en güncel kur */
export async function latestFx(): Promise<FxTable> {
  return getFxTable(new Date(Date.now() + 2 * 86400_000).toISOString(), { ...(await getFxPolicy()), dateRule: "SAME_DAY_BULLETIN" });
}

// ───────── TCMB ─────────
export interface TcmbParsed { bulletinDate: string; bulletinNo: string | null; rates: { currency: string; unit: number; forexBuying: string | null; forexSelling: string | null }[] }

export function parseTcmbXml(xml: string): TcmbParsed {
  const head = xml.match(/<Tarih_Date[^>]*Tarih="(\d{2})\.(\d{2})\.(\d{4})"[^>]*>/);
  if (!head) throw new Error("TCMB yanıtı tanınmadı (Tarih_Date yok)");
  const no = xml.match(/Bulten_No="([^"]+)"/)?.[1] ?? null;
  const rates: TcmbParsed["rates"] = [];
  for (const m of xml.matchAll(/<Currency[^>]*Kod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g)) {
    const body = m[2];
    const g = (tag: string) => body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim() || null;
    rates.push({ currency: m[1], unit: Number(g("Unit") ?? 1), forexBuying: g("ForexBuying"), forexSelling: g("ForexSelling") });
  }
  return { bulletinDate: `${head[3]}-${head[2]}-${head[1]}`, bulletinNo: no, rates };
}

/** TCMB'den bülten çeker (bugün veya belirli gün) ve kaydeder. Var olan bülten tekrar yazılmaz. */
export async function fetchTcmb(dateYmd?: string, actor = "system"): Promise<{ bulletinDate: string; saved: number }> {
  const url = dateYmd
    ? `https://www.tcmb.gov.tr/kurlar/${dateYmd.slice(0, 4)}${dateYmd.slice(5, 7)}/${dateYmd.slice(8, 10)}${dateYmd.slice(5, 7)}${dateYmd.slice(0, 4)}.xml`
    : "https://www.tcmb.gov.tr/kurlar/today.xml";
  let xml: string;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 404 ? " (o gün bülten yok — tatil/hafta sonu olabilir)" : ""}`);
    xml = await res.text();
  } catch (e) {
    throw new Error(`TCMB'ye erişilemedi: ${(e as Error).message}. Kuru bülten numarasıyla elle girebilirsiniz.`);
  }
  const p = parseTcmbXml(xml);
  let saved = 0;
  for (const r of p.rates.filter((x) => FX_CURRENCIES.includes(x.currency as Currency))) {
    const per = (v: string | null) => (v ? String(Number(v) / r.unit) : null);
    const res = await db.insert(s.exchangeRates).values({ currency: r.currency, bulletinDate: p.bulletinDate, bulletinNo: p.bulletinNo, forexBuying: per(r.forexBuying), forexSelling: per(r.forexSelling), source: "TCMB", enteredBy: actor })
      .onConflictDoNothing().returning({ id: s.exchangeRates.id });
    saved += res.length;
  }
  return { bulletinDate: p.bulletinDate, saved };
}
