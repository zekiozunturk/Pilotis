/**
 * Analiz çekirdeği — zaman aralıkları, para ve dağıtım. Saf fonksiyonlar (tarayıcı + sunucu + test).
 * Kurallar:
 *  - Birbirine binen aralıklar iki kez toplanmaz (union).
 *  - Para tutarları kuruş cinsinden tamsayıdır; farklı para birimleri asla doğrudan toplanmaz.
 *  - Dağıtım, kaynak tutarla kuruşu kuruşuna mutabık olur (en büyük kalan yöntemi).
 */
export const MIN = 60_000, H = 3_600_000, DAY = 86_400_000;
export const TZ = 3 * H; // Europe/Istanbul (yaz saati yok)
export type Iv = [number, number];

export const trDay = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10);
export const trHour = (ms: number) => new Date(ms + TZ).getUTCHours();
export const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00+03:00`).getTime();

/** Çakışanları birleştirir; sıralı, ayrık aralıklar döner */
export function union(ivs: Iv[]): Iv[] {
  const xs = ivs.filter(([a, b]) => b > a).map(([a, b]) => [a, b] as Iv).sort((x, y) => x[0] - y[0]);
  const out: Iv[] = [];
  for (const [a, b] of xs) { const l = out[out.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out;
}
export const total = (ivs: Iv[]) => union(ivs).reduce((s, [a, b]) => s + (b - a), 0);
export const rawTotal = (ivs: Iv[]) => ivs.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
export function clip(ivs: Iv[], a: number, b: number): Iv[] { return ivs.map(([x, y]) => [Math.max(x, a), Math.min(y, b)] as Iv).filter(([x, y]) => y > x); }
export function intersect(a: Iv[], b: Iv[]): Iv[] {
  const A = union(a), B = union(b), out: Iv[] = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]), hi = Math.min(A[i][1], B[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (A[i][1] < B[j][1]) i++; else j++;
  }
  return out;
}
export function minus(a: Iv[], b: Iv[]): Iv[] {
  let cur = union(a);
  for (const [x, y] of union(b)) cur = cur.flatMap(([p, q]) => (y <= p || x >= q ? [[p, q] as Iv] : ([[p, Math.min(q, x)], [Math.max(p, y), q]] as Iv[]).filter(([u, v]) => v > u)));
  return cur;
}
/** Eşzamanlı (çakışan) kayıt çiftleri — işaretlemek için */
export function overlapsOf<T extends { iv: Iv }>(xs: T[]): [T, T, number][] {
  const s = [...xs].sort((p, q) => p.iv[0] - q.iv[0]), out: [T, T, number][] = [];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length && s[j].iv[0] < s[i].iv[1]; j++) out.push([s[i], s[j], Math.min(s[i].iv[1], s[j].iv[1]) - s[j].iv[0]]);
  return out;
}

/** Gece penceresi (varsayılan 20:00–06:00, planlama modülüyle aynı). Aralığı gerçek saatlere göre böler. */
export interface NightWindow { startH: number; endH: number }
export const NIGHT: NightWindow = { startH: 20, endH: 6 };
export function nightIvs(a: number, b: number, w: NightWindow = NIGHT): Iv[] {
  const out: Iv[] = [];
  for (let d = dayStart(trDay(a)) - DAY; d < b + DAY; d += DAY) {
    const s = d + w.startH * H, e = d + (w.endH <= w.startH ? DAY : 0) + w.endH * H;
    const lo = Math.max(a, s), hi = Math.min(b, e);
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}
export function splitDayNight(ivs: Iv[], w: NightWindow = NIGHT) {
  const u = union(ivs);
  const night = u.reduce((s, [a, b]) => s + total(nightIvs(a, b, w)), 0);
  const all = total(u);
  return { day: all - night, night, total: all };
}
/** Gece yarısında böler: TR takvim günü → süre */
export function byDay(ivs: Iv[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [a, b] of union(ivs)) {
    let x = a;
    while (x < b) { const d = trDay(x), e = Math.min(b, dayStart(d) + DAY); m.set(d, (m.get(d) ?? 0) + (e - x)); x = e; }
  }
  return m;
}

// ───── Para ─────
export interface Money { currency: string; cents: number }
export const toCents = (x: number | string) => Math.round(Number(x) * 100);
export const fromCents = (c: number) => c / 100;
/** Para birimlerine göre toplar — farklı birimleri tek sayıya indirmez */
export function sumByCurrency(xs: Money[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x.currency] = (out[x.currency] ?? 0) + x.cents;
  return out;
}
export class CurrencyMixError extends Error {}
/** Tek para birimli toplam; karışık gelirse hata — çevirme ancak açık kur ve tarihle yapılır */
export function sumSingle(xs: Money[], currency: string): number {
  let s = 0;
  for (const x of xs) { if (x.currency !== currency) throw new CurrencyMixError(`${x.currency} tutarı ${currency} toplamına doğrudan eklenemez`); s += x.cents; }
  return s;
}
export interface FxNote { rate: number; date: string; method: string }
export function convert(x: Money, to: string, fx: Record<string, FxNote>): Money & { fx?: FxNote } {
  if (x.currency === to) return x;
  const n = fx[`${x.currency}/${to}`];
  if (!n) throw new CurrencyMixError(`${x.currency}→${to} için kur tanımlı değil`);
  return { currency: to, cents: Math.round(x.cents * n.rate), fx: n };
}

// ───── Dağıtım ─────
/** En büyük kalan yöntemi: payların toplamı kaynak tutara (kuruş) tam eşittir */
export function allocate(cents: number, parts: { key: string; weight: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const w = parts.filter((p) => p.weight > 0);
  const W = w.reduce((s, p) => s + p.weight, 0);
  if (!w.length || W <= 0) return out;
  const sign = Math.sign(cents) || 1, abs = Math.abs(cents);
  const raw = w.map((p) => ({ key: p.key, exact: (abs * p.weight) / W }));
  let given = 0;
  for (const r of raw) { const f = Math.floor(r.exact); out.set(r.key, (out.get(r.key) ?? 0) + f); given += f; }
  const rest = raw.map((r) => ({ key: r.key, frac: r.exact - Math.floor(r.exact) })).sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key));
  for (let i = 0; i < abs - given; i++) out.set(rest[i % rest.length].key, out.get(rest[i % rest.length].key)! + 1);
  if (sign < 0) for (const [k, v] of out) out.set(k, -v);
  return out;
}

export const fmtH = (ms: number) => { const m = Math.round(ms / MIN); return `${Math.floor(m / 60)}:${String(Math.abs(m % 60)).padStart(2, "0")}`; };
export const hours = (ms: number) => Math.round((ms / H) * 10) / 10;
