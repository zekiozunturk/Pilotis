/**
 * Çalışma / dinlenme kural motoru — saf, deterministik, dakika hassasiyetinde.
 *
 * Kurallar parametreli "profiller" ile gelir (STCW/MLC gemiadamı, 4857 İş Kanunu kara personeli …).
 * Hangi profilin kime uygulanacağı ve hazır bulunmanın çalışma sayılıp sayılmayacağı onaylı kural
 * kataloğuna bağlıdır (R-020, R-029…); motor yalnız verilen parametreyi uygular, hukuki yorum yapmaz.
 *
 * Kayan pencere: takvim günü toplamı değil, HER 24 saatlik / 7 günlük pencere değerlendirilir.
 * Zaman dilimi: Europe/Istanbul (UTC+3, yaz saati yok).
 */
export type Category = "WORK" | "STANDBY" | "TRAINING" | "LEAVE";

export interface Interval { id?: string; start: number; end: number; category: Category; label?: string } // epoch ms

export interface RestProfile {
  code: string;
  name: string;
  minRest24h?: number | null;          // dk — herhangi bir 24 saatte en az dinlenme
  minRest7d?: number | null;           // dk — herhangi bir 7 günde en az dinlenme
  maxRestPeriods24h?: number | null;   // dinlenme en fazla kaç parçaya bölünebilir
  minLongestRest24h?: number | null;   // parçalardan biri en az (dk)
  maxContinuousWork?: number | null;   // ardışık iki dinlenme arası en fazla (dk)
  maxWork24h?: number | null;          // herhangi bir 24 saatte en fazla çalışma (dk)
  minContinuousRest7d?: number | null; // 7 günde en az bir kesintisiz dinlenme (dk) — hafta tatili
  weeklyNormal?: number | null;        // takvim haftası normal süre (dk) — aşan fazla mesai
  weeklyMax?: number | null;           // takvim haftası azami (dk)
  nightStartHour: number;              // gece başlangıcı (yerel saat)
  nightEndHour: number;
  maxNightWork?: number | null;        // bir gece diliminde en fazla çalışma (dk)
  nightShiftMinMinutes: number;        // "gece görevi" sayılması için gece diliminde en az (dk)
  standbyCountsAsWork: boolean;        // hazır bulunma çalışma sayılır mı (onaylı kurala bağlı)
  trainingCountsAsWork: boolean;
  minRestBlock: number;                // bundan kısa aralar dinlenme sayılmaz (dk)
}

export interface Violation {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  windowStart?: number;
  windowEnd?: number;
  ruleRef: string;
}

export interface Metrics {
  workMinutes: number;
  nightMinutes: number;
  nightShifts: number;
  standbyMinutes: number;
  minRest24h: number | null;      // dk — en kötü 24 saat penceresi
  minRest7d: number | null;
  longestContinuousWork: number;
  weekly: { weekStart: string; workMinutes: number; overtimeMinutes: number }[];
}

export interface Evaluation { metrics: Metrics; violations: Violation[] }

const MIN = 60_000, H = 60 * MIN, DAY = 24 * H, TZ = 3 * H;

/** Çalışma sayılan aralıkları birleştirir */
export function workIntervals(xs: Interval[], p: RestProfile): [number, number][] {
  const w = xs.filter((x) => x.category === "WORK" || (x.category === "STANDBY" && p.standbyCountsAsWork) || (x.category === "TRAINING" && p.trainingCountsAsWork))
    .map((x) => [x.start, x.end] as [number, number]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of w) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

/** minRestBlock'tan kısa aralar dinlenme sayılmaz → çalışmaya katılır */
export function closeShortGaps(w: [number, number][], minRestBlock: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of w) {
    const last = out.at(-1);
    if (last && a - last[1] < minRestBlock * MIN) last[1] = b; else out.push([a, b]);
  }
  return out;
}

function overlap(w: [number, number][], s: number, e: number): number {
  let t = 0;
  for (const [a, b] of w) { const x = Math.max(a, s), y = Math.min(b, e); if (y > x) t += y - x; }
  return t;
}

/** Dinlenme parçaları (pencere içinde kırpılmış) */
function restSegments(w: [number, number][], s: number, e: number): number[] {
  const segs: number[] = [];
  let cur = s;
  for (const [a, b] of w) {
    if (b <= s || a >= e) continue;
    if (a > cur) segs.push(Math.min(a, e) - cur);
    cur = Math.max(cur, b);
  }
  if (e > cur) segs.push(e - cur);
  return segs;
}

/** Aday pencere başlangıçları: maksimum çalışma bir aralık başında başlayan ya da bir aralık sonunda biten pencerededir */
function candidateStarts(w: [number, number][], len: number, from: number, to: number): number[] {
  const c = new Set<number>();
  for (const [a, b] of w) { c.add(a); c.add(b); c.add(a - len); c.add(b - len); }
  return [...c].filter((s) => s >= from && s + len <= to).sort((x, y) => x - y);
}

export function localParts(ms: number) { const d = new Date(ms + TZ); return { ymd: d.toISOString().slice(0, 10), hour: d.getUTCHours(), dow: (d.getUTCDay() + 6) % 7 }; }
function localMidnight(ms: number) { const d = new Date(ms + TZ); d.setUTCHours(0, 0, 0, 0); return d.getTime() - TZ; }

const fmtH = (m: number) => `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`;
const fmtT = (ms: number) => { const d = new Date(ms + TZ); return `${d.toISOString().slice(8, 10)}.${d.toISOString().slice(5, 7)} ${d.toISOString().slice(11, 16)}`; };

/**
 * @param xs  kişinin kayıtları (değerlendirme aralığından en az 7 gün öncesini de içermeli)
 * @param from/to değerlendirme aralığı (ihlaller yalnız bu aralıkla kesişen pencerelerden üretilir)
 */
export function evaluate(xs: Interval[], p: RestProfile, from: number, to: number): Evaluation {
  const violations: Violation[] = [];
  const raw = workIntervals(xs, p);
  const w = closeShortGaps(raw, p.minRestBlock);
  const inRange = (s: number, e: number) => e > from && s < to;

  // Çakışan kayıtlar (aynı kişi, aynı anda iki görev/vardiya)
  const sorted = [...xs].filter((x) => x.category !== "LEAVE").sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
    if (inRange(sorted[j].start, sorted[i].end)) violations.push({ code: "OVERLAP", severity: "ERROR", ruleRef: "Planlama", message: `Çakışan kayıtlar: ${sorted[i].label ?? "kayıt"} ve ${sorted[j].label ?? "kayıt"} (${fmtT(sorted[j].start)})`, windowStart: sorted[j].start, windowEnd: sorted[i].end });
  }
  // İzin gününe görev
  for (const l of xs.filter((x) => x.category === "LEAVE")) {
    for (const x of xs.filter((y) => y.category !== "LEAVE" && y.start < l.end && y.end > l.start)) {
      if (inRange(x.start, x.end)) violations.push({ code: "ON_LEAVE", severity: "ERROR", ruleRef: "Planlama", message: `İzin sırasında görev: ${x.label ?? "kayıt"} (${fmtT(x.start)})`, windowStart: x.start, windowEnd: x.end });
    }
  }

  // Aynı türdeki ihlaller ayrı dönemler (çakışmayan pencereler) olarak raporlanır
  const lastEnd = new Map<string, number>();
  const episode = (code: string, s: number, e: number) => { const le = lastEnd.get(code); if (le !== undefined && s < le) return false; lastEnd.set(code, e); return true; };

  // 24 saatlik kayan pencere
  let worst24: number | null = null;
  // Dinlenme parçalanması pencere hizasına duyarlıdır: aday noktalara ek olarak 15 dk ızgara taranır
  const grid: number[] = [];
  for (let g = Math.floor((from - DAY) / (15 * MIN)) * 15 * MIN; g + DAY <= to + DAY; g += 15 * MIN) grid.push(g);
  const starts24 = [...new Set([...candidateStarts(w, DAY, from - DAY, to + DAY), ...grid])].sort((a, b) => a - b);
  for (const s of starts24) {
    const e = s + DAY;
    if (!inRange(s, e)) continue;
    const work = overlap(w, s, e);
    const rest = (DAY - work) / MIN;
    worst24 = worst24 === null ? rest : Math.min(worst24, rest);
    if (p.minRest24h != null && rest < p.minRest24h && episode("REST_24H", s, e)) {
      violations.push({ code: "REST_24H", severity: "ERROR", ruleRef: p.name, message: `24 saatlik pencerede dinlenme ${fmtH(rest)} < ${fmtH(p.minRest24h)} (${fmtT(s)} – ${fmtT(e)})`, windowStart: s, windowEnd: e });
    }
    if (p.maxWork24h != null && work / MIN > p.maxWork24h && episode("WORK_24H", s, e)) {
      violations.push({ code: "WORK_24H", severity: "ERROR", ruleRef: p.name, message: `24 saatte çalışma ${fmtH(work / MIN)} > ${fmtH(p.maxWork24h)} (${fmtT(s)} – ${fmtT(e)})`, windowStart: s, windowEnd: e });
    }
    if (p.maxRestPeriods24h != null && p.minLongestRest24h != null && p.minRest24h != null && rest >= p.minRest24h) {
      const segs = restSegments(w, s, e).map((x) => x / MIN).filter((x) => x >= p.minRestBlock).sort((a, b) => b - a);
      const top = segs.slice(0, p.maxRestPeriods24h);
      const sum = top.reduce((a, b) => a + b, 0);
      if (((top[0] ?? 0) < p.minLongestRest24h || sum < p.minRest24h) && episode("REST_SPLIT", s, e)) {
        violations.push({ code: "REST_SPLIT", severity: "ERROR", ruleRef: p.name, message: `Dinlenme en fazla ${p.maxRestPeriods24h} parçada ve biri en az ${fmtH(p.minLongestRest24h)} olmalı; en uzun parça ${fmtH(top[0] ?? 0)} (${fmtT(s)} – ${fmtT(e)})`, windowStart: s, windowEnd: e });
      }
    }
  }

  // 7 günlük kayan pencere
  let worst7: number | null = null;
  const W7 = 7 * DAY;

  for (const s of candidateStarts(w, W7, from - W7, to + W7)) {
    const e = s + W7;
    if (!inRange(s, e)) continue;
    const rest = (W7 - overlap(w, s, e)) / MIN;
    worst7 = worst7 === null ? rest : Math.min(worst7, rest);
    if (p.minRest7d != null && rest < p.minRest7d && episode("REST_7D", s, e)) {
      violations.push({ code: "REST_7D", severity: "ERROR", ruleRef: p.name, message: `7 günlük pencerede dinlenme ${fmtH(rest)} < ${fmtH(p.minRest7d)} (${fmtT(s)} – ${fmtT(e)})`, windowStart: s, windowEnd: e });
    }
    if (p.minContinuousRest7d != null) {
      const longest = Math.max(0, ...restSegments(raw, s, e)) / MIN;
      if (longest < p.minContinuousRest7d && episode("WEEKLY_REST", s, e)) {
        violations.push({ code: "WEEKLY_REST", severity: "ERROR", ruleRef: p.name, message: `7 günde kesintisiz dinlenme ${fmtH(longest)} < ${fmtH(p.minContinuousRest7d)} (hafta tatili) (${fmtT(s)} – ${fmtT(e)})`, windowStart: s, windowEnd: e });
      }
    }
  }

  // Kesintisiz çalışma (iki dinlenme arası)
  let longestCont = 0;
  for (const [a, b] of w) {
    const m = (b - a) / MIN;
    if (inRange(a, b)) longestCont = Math.max(longestCont, m);
    if (p.maxContinuousWork != null && m > p.maxContinuousWork && inRange(a, b)) {
      violations.push({ code: "CONTINUOUS_WORK", severity: "ERROR", ruleRef: p.name, message: `Ardışık dinlenmeler arası ${fmtH(m)} > ${fmtH(p.maxContinuousWork)} (${fmtT(a)} – ${fmtT(b)})`, windowStart: a, windowEnd: b });
    }
  }

  // Gece çalışması (yerel nightStart → ertesi gün nightEnd)
  let nightMinutes = 0, nightShifts = 0;
  for (let d = localMidnight(from) - DAY; d < to; d += DAY) {
    const ns = d + p.nightStartHour * H, ne = d + DAY + p.nightEndHour * H;
    if (!inRange(ns, ne)) continue;
    const nm = overlap(raw, Math.max(ns, from), Math.min(ne, to)) / MIN;
    const full = overlap(raw, ns, ne) / MIN;
    nightMinutes += nm;
    if (full >= p.nightShiftMinMinutes) nightShifts++;
    if (p.maxNightWork != null && full > p.maxNightWork) {
      violations.push({ code: "NIGHT_WORK", severity: "ERROR", ruleRef: p.name, message: `Gece diliminde çalışma ${fmtH(full)} > ${fmtH(p.maxNightWork)} (${fmtT(ns)} – ${fmtT(ne)})`, windowStart: ns, windowEnd: ne });
    }
  }

  // Takvim haftası (pazartesi 00:00 yerel)
  const weekly: Metrics["weekly"] = [];
  const firstMonday = localMidnight(from) - localParts(from).dow * DAY;
  for (let ws = firstMonday; ws < to; ws += 7 * DAY) {
    const wm = overlap(raw, ws, ws + 7 * DAY) / MIN;
    const ot = p.weeklyNormal != null ? Math.max(0, wm - p.weeklyNormal) : 0;
    weekly.push({ weekStart: localParts(ws).ymd, workMinutes: wm, overtimeMinutes: ot });
    if (p.weeklyMax != null && wm > p.weeklyMax) violations.push({ code: "WEEKLY_MAX", severity: "ERROR", ruleRef: p.name, message: `Hafta (${localParts(ws).ymd}) çalışma ${fmtH(wm)} > azami ${fmtH(p.weeklyMax)}` });
    else if (ot > 0) violations.push({ code: "OVERTIME", severity: "WARNING", ruleRef: p.name, message: `Hafta (${localParts(ws).ymd}) fazla mesai ${fmtH(ot)} (normal ${fmtH(p.weeklyNormal!)})` });
  }

  const standbyMinutes = xs.filter((x) => x.category === "STANDBY").reduce((a, x) => a + Math.max(0, Math.min(x.end, to) - Math.max(x.start, from)), 0) / MIN;
  return {
    metrics: { workMinutes: overlap(raw, from, to) / MIN, nightMinutes, nightShifts, standbyMinutes, minRest24h: worst24, minRest7d: worst7, longestContinuousWork: longestCont, weekly },
    violations,
  };
}

/** Bir kayıt eklenirse ne olur? — yeni ihlalleri döndürür (önceden var olanlar hariç) */
export function whatIf(existing: Interval[], add: Interval, p: RestProfile, from: number, to: number): { before: Evaluation; after: Evaluation; newViolations: Violation[] } {
  const before = evaluate(existing, p, from, to);
  const after = evaluate([...existing, add], p, from, to);
  const key = (v: Violation) => `${v.code}|${v.windowStart ?? ""}|${v.windowEnd ?? ""}`;
  const had = new Set(before.violations.map(key));
  // yeni kayıtla kesişen pencerelerdeki yeni hatalar
  const touches = (v: Violation) => v.windowStart === undefined || (v.windowStart < add.end && (v.windowEnd ?? v.windowStart) > add.start);
  return { before, after, newViolations: after.violations.filter((v) => v.severity === "ERROR" && !had.has(key(v)) && touches(v)) };
}
