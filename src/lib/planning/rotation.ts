/**
 * Ekip rotasyonu (münavebe) modeli — saf, deterministik; hem tarayıcıda (canlı "oynanabilir" ekran) hem sunucuda
 * (takvime uygulama, ölçüm) aynı hesap kullanılır.
 *
 * Varsayım: her römorkörün kendi ekipleri vardır; ekip "görev günleri" boyunca her gün aynı vardiyayı (gündüz veya gece)
 * tutar, ardından "izin günleri" boyunca hiç görev almaz. Kesintisiz hizmet için römorkör başına
 * ⌈(görev+izin) / görev⌉ ekip gerekir (7/7 düzeninde 2 ekip: A ve B).
 *
 * Sağlık skoru bir işletme göstergesidir; hukuki uygunluk kararı değildir. Kurallar seçilen profilden (STCW/MLC + 854) gelir.
 */
import { evaluate, type Evaluation, type Interval, type RestProfile, type Violation } from "./rest";

const MIN = 60_000, H = 60 * MIN, DAY = 24 * H, TZ = 3 * H;
export const TEAM_LETTERS = "ABCDEFGH";

export type TugMode = "DAY" | "NIGHT";
export interface RotationTug { id: string; name: string; mode: TugMode }
export interface RotationRole { code: string; label: string }
export interface RotationModel {
  tugs: RotationTug[];
  roles: RotationRole[];
  onDays: number;          // görev günü
  offDays: number;         // izin günü
  day: { start: string; hours: number };   // gündüz vardiyası başlangıcı (HH:MM, TR) ve süresi
  night: { start: string; hours: number }; // gece vardiyası
  anchor: string;          // A ekiplerinin ilk görev günü (YYYY-MM-DD)
  reservePct: number;      // yedek havuzu (yıllık izin, rapor, eğitim) — kadroya eklenir
  nightRotation: boolean;  // gece görevi römorkörler arasında her dönemde kaydırılır (adil dağılım)
}

export const DEFAULT_ROTATION: RotationModel = {
  tugs: [
    { id: "R1", name: "Römork-1", mode: "DAY" },
    { id: "R2", name: "Römork-2", mode: "DAY" },
    { id: "R3", name: "Römork-3", mode: "NIGHT" },
    { id: "R4", name: "Römork-4", mode: "NIGHT" },
    { id: "R5", name: "Römork-5", mode: "DAY" },
    { id: "R6", name: "Römork-6", mode: "DAY" },
    { id: "R7", name: "Römork-7", mode: "DAY" },
  ],
  roles: [
    { code: "KAPTAN", label: "Römorkör Kaptanı" },
    { code: "BASCARKCI", label: "Başçarkçı" },
    { code: "YAGCI", label: "Yağcı" },
    { code: "PIMCI", label: "Pimci" },
  ],
  onDays: 7, offDays: 7,
  day: { start: "07:00", hours: 14 },
  night: { start: "18:00", hours: 14 },
  anchor: "2026-10-12",
  reservePct: 10,
  nightRotation: false,
};

export interface Team { key: string; tugId: string; tugIndex: number; tugName: string; letter: string; offsetDays: number }

const anchorMs = (m: RotationModel) => new Date(`${m.anchor}T00:00:00+03:00`).getTime();
const hm = (x: string) => { const [h, mm] = x.split(":").map(Number); return (h || 0) * H + (mm || 0) * MIN; };
const mod = (a: number, n: number) => ((a % n) + n) % n;

export function cycleDays(m: RotationModel) { return Math.max(1, m.onDays) + Math.max(0, m.offDays); }
export function teamsPerTug(m: RotationModel) { return Math.ceil(cycleDays(m) / Math.max(1, m.onDays)); }

export function teamsOf(m: RotationModel): Team[] {
  const k = teamsPerTug(m), on = Math.max(1, m.onDays);
  return m.tugs.flatMap((t, j) => Array.from({ length: k }, (_, i) => ({ key: `${t.id}-${TEAM_LETTERS[i]}`, tugId: t.id, tugIndex: j, tugName: t.name, letter: TEAM_LETTERS[i], offsetDays: i * on })));
}

/** Ekibin d. gündeki durumu (d: anchor'dan gün sayısı). null → izinde */
export function teamDuty(m: RotationModel, team: Team, d: number): TugMode | null {
  const on = Math.max(1, m.onDays), cyc = cycleDays(m);
  const pos = mod(d - team.offsetDays, cyc);
  if (pos >= on) return null;
  if (!m.nightRotation) return m.tugs[team.tugIndex].mode;
  const periodStart = d - pos;
  const r = Math.floor(periodStart / on);                       // tüm ekiplerde ortak dönem sayacı
  return m.tugs[mod(team.tugIndex + r, m.tugs.length)].mode;    // mod dizisi kaydırılır → her dönem aynı sayıda gece römorkörü
}

export function teamIntervals(m: RotationModel, team: Team, fromMs: number, toMs: number): Interval[] {
  const a = anchorMs(m), out: Interval[] = [];
  const d0 = Math.floor((fromMs - a) / DAY) - 2, d1 = Math.ceil((toMs - a) / DAY) + 1;
  for (let d = d0; d <= d1; d++) {
    const mode = teamDuty(m, team, d);
    if (!mode) continue;
    const sh = mode === "DAY" ? m.day : m.night;
    const start = a + d * DAY + hm(sh.start), end = start + Math.max(0, sh.hours) * H;
    if (end > fromMs && start < toMs && end > start) out.push({ start, end, category: "WORK", label: mode === "DAY" ? "Rotasyon · gündüz" : "Rotasyon · gece" });
  }
  return out;
}

export interface Staffing { cycle: number; teamsPerTug: number; teams: number; crewPerTeam: number; crew: number; reserve: number; total: number; dayTugs: number; nightTugs: number; onShare: number }
export function staffing(m: RotationModel): Staffing {
  const k = teamsPerTug(m), teams = m.tugs.length * k, crew = teams * m.roles.length;
  const reserve = Math.ceil((crew * Math.max(0, m.reservePct)) / 100);
  return { cycle: cycleDays(m), teamsPerTug: k, teams, crewPerTeam: m.roles.length, crew, reserve, total: crew + reserve,
    dayTugs: m.tugs.filter((t) => t.mode === "DAY").length, nightTugs: m.tugs.filter((t) => t.mode === "NIGHT").length, onShare: Math.max(1, m.onDays) / cycleDays(m) };
}

/** Saatlik kapsama: her saat diliminde (yerel saat) görevdeki en az / en çok römorkör ve beklenen sayı */
export interface CoverageHour { hour: number; min: number; max: number; expected: number }
export function coverage(m: RotationModel): { hours: CoverageHour[]; gaps: number; surplusHours: number } {
  const teams = teamsOf(m), a = anchorMs(m), cyc = cycleDays(m);
  const from = a + 2 * cyc * DAY, to = from + Math.max(14, 2 * cyc) * DAY;
  const byTug = new Map<number, Interval[]>();
  for (const t of teams) byTug.set(t.tugIndex, [...(byTug.get(t.tugIndex) ?? []), ...teamIntervals(m, t, from - DAY, to + DAY)]);
  const inWin = (h: number, sh: { start: string; hours: number }) => { const s = hm(sh.start) / H; return mod(h + 0.5 - s, 24) < sh.hours; };
  const expected = (h: number) => (inWin(h, m.day) ? m.tugs.filter((t) => t.mode === "DAY").length : 0) + (inWin(h, m.night) ? m.tugs.filter((t) => t.mode === "NIGHT").length : 0);
  const hours: CoverageHour[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, min: Infinity, max: 0, expected: expected(h) }));
  let gaps = 0, surplusHours = 0;
  for (let t = from; t < to; t += H) {
    const mid = t + 30 * MIN, h = new Date(mid + TZ).getUTCHours();
    let n = 0;
    for (const ivs of byTug.values()) if (ivs.some((x) => x.start <= mid && x.end > mid)) n++;
    const c = hours[h]; c.min = Math.min(c.min, n); c.max = Math.max(c.max, n);
    if (n < c.expected) gaps++;
    if (n > c.expected) surplusHours++;
  }
  for (const c of hours) if (c.min === Infinity) c.min = 0;
  return { hours, gaps, surplusHours };
}

/* ───────────── Ölçüm ve sağlık skoru ───────────── */

export interface UnitMeasure {
  key: string; label: string; people: number;
  evaluation: Evaluation;
  errors: Violation[]; warnings: Violation[];
  weeks: number;
  avgWeeklyHours: number; maxWeekHours: number; avgOvertimeHours: number;
  nightShiftsPerWeek: number; minRest24h: number | null; minRest7d: number | null; maxConsecutiveDays: number;
  avgDailyRestOnDuty: number | null; // görev günlerinde ortalama günlük dinlenme (saat)
  health: Health;
}

export interface HealthPart { key: string; label: string; weight: number; value: number; detail: string }
export interface Health { score: number; band: "OK" | "WARN" | "RISK"; bandLabel: string; parts: HealthPart[]; capped: boolean }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const h1 = (m: number) => Math.round((m / 60) * 10) / 10;

/** Bileşenler ve ağırlıklar ekranda açıkça gösterilir */
export function healthOf(x: { errorsPerWeek: number; minRest24h: number | null; minRest7d: number | null; maxConsecutiveDays: number; avgWeeklyHours: number; anyError: boolean }, p: RestProfile): Health {
  const req24 = p.minRest24h ?? 10 * 60, req7 = p.minRest7d ?? 77 * 60, maxDays = p.maxConsecutiveDutyDays ?? 6, normal = (p.weeklyNormal ?? 48 * 60) / 60;
  const parts: HealthPart[] = [
    { key: "compliance", label: "Kural uyumu", weight: 30, value: clamp01(1 - x.errorsPerWeek), detail: x.errorsPerWeek === 0 ? "İhlal yok" : `Haftada ~${Math.round(x.errorsPerWeek * 10) / 10} ihlal dönemi` },
    { key: "rest24", label: "24 saatlik dinlenme", weight: 20, value: x.minRest24h === null ? 1 : clamp01(x.minRest24h / req24), detail: `En kötü ${x.minRest24h === null ? "—" : h1(x.minRest24h)} sa / gerekli ${h1(req24)} sa` },
    { key: "rest7", label: "7 günlük dinlenme", weight: 20, value: x.minRest7d === null ? 1 : clamp01(x.minRest7d / req7), detail: `En kötü ${x.minRest7d === null ? "—" : h1(x.minRest7d)} sa / gerekli ${h1(req7)} sa` },
    { key: "days", label: "Ardışık görev günü", weight: 15, value: x.maxConsecutiveDays <= maxDays ? 1 : maxDays / x.maxConsecutiveDays, detail: `En uzun ${x.maxConsecutiveDays} gün / sınır ${maxDays}` },
    { key: "load", label: "Haftalık yük", weight: 15, value: x.avgWeeklyHours <= normal ? 1 : clamp01(normal / x.avgWeeklyHours), detail: `Ortalama ${Math.round(x.avgWeeklyHours * 10) / 10} sa / normal ${normal} sa` },
  ];
  let score = Math.round(parts.reduce((a, p2) => a + p2.weight * p2.value, 0));
  const cap = x.anyError ? 69 : x.maxConsecutiveDays > maxDays ? 84 : 100; // ihlal varken "sağlıklı", ardışık gün aşımında "sağlıklı" gösterilmez
  const capped = score > cap;
  if (capped) score = cap;
  const band = score >= 85 ? "OK" : score >= 70 ? "WARN" : "RISK";
  return { score, band, bandLabel: band === "OK" ? "Sağlıklı" : band === "WARN" ? "Dikkat" : "Riskli", parts, capped };
}

export function measure(key: string, label: string, people: number, ivs: Interval[], p: RestProfile, from: number, to: number): UnitMeasure {
  const ev = evaluate(ivs, p, from, to);
  const weeks = (to - from) / (7 * DAY);
  const errors = ev.violations.filter((v) => v.severity === "ERROR"), warnings = ev.violations.filter((v) => v.severity === "WARNING");
  const fullWeeks = ev.metrics.weekly.filter((w) => { const ws = new Date(`${w.weekStart}T00:00:00+03:00`).getTime(); return ws >= from && ws + 7 * DAY <= to; });
  const dutyDays = new Set(ivs.filter((x) => x.category === "WORK" && x.end > from && x.start < to).map((x) => Math.floor((x.start + TZ) / DAY))).size;
  const workH = ev.metrics.workMinutes / 60;
  const base = {
    errorsPerWeek: errors.length / Math.max(1, weeks), minRest24h: ev.metrics.minRest24h, minRest7d: ev.metrics.minRest7d,
    maxConsecutiveDays: ev.metrics.maxConsecutiveDutyDays, avgWeeklyHours: workH / Math.max(1e-9, weeks), anyError: errors.length > 0,
  };
  return {
    key, label, people, evaluation: ev, errors, warnings, weeks,
    avgWeeklyHours: base.avgWeeklyHours,
    maxWeekHours: Math.max(0, ...fullWeeks.map((w) => w.workMinutes / 60)),
    avgOvertimeHours: fullWeeks.length ? fullWeeks.reduce((a, w) => a + w.overtimeMinutes, 0) / 60 / fullWeeks.length : 0,
    nightShiftsPerWeek: ev.metrics.nightShifts / Math.max(1, weeks),
    minRest24h: ev.metrics.minRest24h, minRest7d: ev.metrics.minRest7d, maxConsecutiveDays: ev.metrics.maxConsecutiveDutyDays,
    avgDailyRestOnDuty: dutyDays ? 24 - workH / dutyDays : null,
    health: healthOf(base, p),
  };
}

export interface SystemHealth extends Health { units: number; people: number; unitsWithErrors: number; peopleWithErrors: number; worst24: number | null; worst7: number | null }
/** Sistem sağlığı: kişi ağırlıklı ortalama; en kötü değerler ayrıca raporlanır */
export function systemHealth(units: UnitMeasure[], p: RestProfile): SystemHealth {
  const people = units.reduce((a, u) => a + u.people, 0) || 1;
  const w = (f: (u: UnitMeasure) => number) => units.reduce((a, u) => a + f(u) * u.people, 0) / people;
  const worst = (f: (u: UnitMeasure) => number | null) => { const xs = units.map(f).filter((x): x is number => x !== null); return xs.length ? Math.min(...xs) : null; };
  const h = healthOf({
    errorsPerWeek: w((u) => u.errors.length / Math.max(1, u.weeks)),
    minRest24h: worst((u) => u.minRest24h), minRest7d: worst((u) => u.minRest7d),
    maxConsecutiveDays: Math.max(0, ...units.map((u) => u.maxConsecutiveDays)), avgWeeklyHours: w((u) => u.avgWeeklyHours),
    anyError: units.some((u) => u.errors.length > 0),
  }, p);
  // Uyum bileşeni: ihlalsiz kişi oranı (sistem düzeyinde daha anlaşılır)
  const okShare = units.reduce((a, u) => a + (u.errors.length ? 0 : u.people), 0) / people;
  h.parts[0] = { ...h.parts[0], value: okShare, detail: `Kişilerin %${Math.round(okShare * 100)}'ü ihlalsiz` };
  let score = Math.round(h.parts.reduce((a, x) => a + x.weight * x.value, 0));
  const cap = units.some((u) => u.errors.length > 0) ? 69 : units.some((u) => u.maxConsecutiveDays > (p.maxConsecutiveDutyDays ?? 6)) ? 84 : 100;
  const capped = score > cap;
  if (capped) score = cap;
  const band = score >= 85 ? "OK" : score >= 70 ? "WARN" : "RISK";
  return {
    ...h, score, band, capped, bandLabel: band === "OK" ? "Sağlıklı" : band === "WARN" ? "Dikkat" : "Riskli",
    units: units.length, people: units.reduce((a, u) => a + u.people, 0),
    unitsWithErrors: units.filter((u) => u.errors.length).length, peopleWithErrors: units.reduce((a, u) => a + (u.errors.length ? u.people : 0), 0),
    worst24: worst((u) => u.minRest24h), worst7: worst((u) => u.minRest7d),
  };
}

export interface Simulation { model: RotationModel; staffing: Staffing; teams: (Team & { m: UnitMeasure; mode: string })[]; system: SystemHealth; coverage: ReturnType<typeof coverage>; from: number; to: number }

/** Modeli simüle eder: ısınma için 2 döngü sonrasından başlayıp en az 4 hafta / 2 döngü değerlendirir */
export function simulate(m: RotationModel, p: RestProfile): Simulation {
  const a = anchorMs(m), cyc = cycleDays(m);
  const from = a + 2 * cyc * DAY, to = from + Math.max(28, 2 * cyc) * DAY;
  const teams = teamsOf(m);
  const cache = new Map<string, UnitMeasure>();
  const out = teams.map((t) => {
    const ivs = teamIntervals(m, t, from - 8 * DAY, to + 8 * DAY);
    const sig = ivs.map((x) => `${x.start}-${x.end}`).join(",");
    let um = cache.get(sig);
    if (!um) { um = measure(t.key, `${t.tugName} · ${t.letter}`, m.roles.length, ivs, p, from, to); cache.set(sig, um); }
    const modes = new Set<string>(); for (let d = Math.floor((from - a) / DAY); d < Math.floor((to - a) / DAY); d++) { const x = teamDuty(m, t, d); if (x) modes.add(x); }
    return { ...t, m: { ...um, key: t.key, label: `${t.tugName} · ${t.letter} ekibi` }, mode: modes.size > 1 ? "Dönüşümlü" : modes.has("NIGHT") ? "Gece" : "Gündüz" };
  });
  return { model: m, staffing: staffing(m), teams: out, system: systemHealth(out.map((x) => x.m), p), coverage: coverage(m), from, to };
}

/** Karşılaştırma için otomatik senaryolar — mevcut modelden türetilir */
export function scenarios(m: RotationModel): { key: string; title: string; why: string; model: RotationModel }[] {
  const both = (h: number) => ({ day: { ...m.day, hours: h }, night: { ...m.night, hours: h } });
  const list = [
    { key: "current", title: "Mevcut model", why: "Ekrandaki ayarlar", model: m },
    { key: "h13", title: `${m.onDays}/${m.offDays} · günde 13 saat`, why: "7 günde 91 saat çalışma → 77 saat dinlenme sınırı karşılanır", model: { ...m, ...both(13) } },
    { key: "h12", title: `${m.onDays}/${m.offDays} · günde 12 saat`, why: "Dinlenmede pay bırakır; 854 haftalık 48 saat üstü azalır", model: { ...m, ...both(12) } },
    { key: "d6", title: `6/6 · günde ${m.day.hours} saat`, why: "Ardışık 6 gün sınırı (854) ve 7 günde 77 saat dinlenme birlikte karşılanır; ekip sayısı aynı", model: { ...m, onDays: 6, offDays: 6 } },
    { key: "t3", title: `7/14 · günde ${m.day.hours} saat (3 ekip)`, why: "Daha uzun toparlanma; kadro %50 artar, görev haftasındaki ihlaller sürer", model: { ...m, onDays: 7, offDays: 14 } },
  ];
  return list.filter((x, i) => i === 0 || JSON.stringify(x.model) !== JSON.stringify(m));
}

/** Kayıtlı model doğrulama (sunucu ve form) */
export function validateModel(m: RotationModel): string[] {
  const e: string[] = [];
  if (!m.tugs.length) e.push("En az bir römorkör olmalı");
  if (m.tugs.length > 30) e.push("En fazla 30 römorkör");
  if (new Set(m.tugs.map((t) => t.id)).size !== m.tugs.length) e.push("Römorkör kimlikleri benzersiz olmalı");
  if (m.tugs.some((t) => !t.name.trim())) e.push("Römorkör adı boş olamaz");
  if (!m.roles.length || m.roles.length > 12) e.push("Ekip başına 1–12 görev rolü olmalı");
  if (!(m.onDays >= 1 && m.onDays <= 28)) e.push("Görev günü 1–28 arası olmalı");
  if (!(m.offDays >= 0 && m.offDays <= 28)) e.push("İzin günü 0–28 arası olmalı");
  for (const [n, sh] of [["Gündüz", m.day], ["Gece", m.night]] as const) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sh.start)) e.push(`${n} başlangıcı SS:DD olmalı`);
    if (!(sh.hours > 0 && sh.hours <= 24)) e.push(`${n} vardiya süresi 0–24 saat olmalı`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.anchor)) e.push("Başlangıç tarihi YYYY-AA-GG olmalı");
  if (!(m.reservePct >= 0 && m.reservePct <= 100)) e.push("Yedek oranı %0–100 olmalı");
  return e;
}

/** Ekip yuvasına atanmış kişiler için takvim kayıtları üretir (seed ve "takvime uygula" aynı fonksiyonu kullanır) */
export function rotationShifts(m: RotationModel, people: { id: string; rotationTeam: string | null }[], fromMs: number, toMs: number) {
  const teams = new Map(teamsOf(m).map((t) => [t.key, t]));
  const out: { personnelId: string; teamKey: string; tugName: string; start: number; end: number; note: string }[] = [];
  for (const p of people) {
    const t = p.rotationTeam ? teams.get(p.rotationTeam) : undefined;
    if (!t) continue;
    for (const iv of teamIntervals(m, t, fromMs, toMs)) {
      if (iv.start < fromMs || iv.start >= toMs) continue; // başlangıcı aralıkta olan vardiyalar
      out.push({ personnelId: p.id, teamKey: t.key, tugName: t.tugName, start: iv.start, end: iv.end, note: `${iv.label} · ${t.tugName} · ${t.letter} ekibi` });
    }
  }
  return out;
}

export function teamLabel(m: RotationModel, key: string | null | undefined) {
  if (!key) return null;
  const t = teamsOf(m).find((x) => x.key === key);
  return t ? `${t.tugName} · ${t.letter} ekibi` : `${key} (modelde yok)`;
}
