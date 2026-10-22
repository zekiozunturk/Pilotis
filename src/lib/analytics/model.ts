/**
 * Performans ve Operasyon Analiz Merkezi — veri modeli ve ölçümler (saf).
 * Ölçüm sözlüğü ANALYTICS_GLOSSARY'de; rapor tasarımcısı aynı tanımları kullanır, değiştiremez.
 */
import { MIN, H, DAY, trDay, dayStart, union, total, clip, intersect, minus, splitDayNight, byDay, allocate, overlapsOf, type Iv, type NightWindow, NIGHT, sumByCurrency } from "./core";
import { evaluate, type Interval, type Violation } from "../planning/rest";
import { profileByCode } from "../planning/profiles";

// ───────── Veri kümesi ─────────
export interface DEvent { type: string; at: number; assetId?: string | null; reason?: string | null; note?: string | null; kind?: string | null }
export interface DOp {
  id: string; ref: string; typeCode: string; typeName: string; vesselId: string; vesselName: string; gt: number | null;
  billingPartyId: string | null; agentPartyId: string | null; facilityId: string | null; priority: string;
  plannedStart: number | null; plannedEnd: number | null; opStatus: string; accrualStatus: string; accountingStatus: string; notifyStatus?: string;
  cancelReason: string | null; events: DEvent[]; kinds: string[]; plannedTugs: number; tariffVersionId: string | null;
}
export interface DPerson { id: string; name: string; title: string; crewRole: string | null; teamKey: string | null; unit: string | null; photoUrl: string | null; workProfile: string }
export interface DAsset { id: string; code: string | null; name: string; type: string; bollardPullT: number | null; photoUrl: string | null; mode: "DAY" | "NIGHT" | null }
export interface DShift { id: string; personnelId: string; category: string; status: string; start: number; end: number; actualStart: number | null; actualEnd: number | null; actualSource: string | null; approved: boolean; overtimeReason: string | null; correctionReason: string | null; assetId: string | null; operationId: string | null; exception: boolean; note: string | null }
export interface DPart { id: string; opId: string; personnelId: string | null; assetId: string | null; role: string | null; from: number; to: number; source: string; approved: boolean; note: string | null }
export interface DPlan { opId: string; personnelId: string | null; assetId: string | null; from: number; to: number }
export interface DDown { assetId: string; kind: string; from: number; to: number; note: string | null }
export interface DMeter { assetId: string; day: string; engineHours: number | null; fuel: number | null; measured: boolean }
export interface DCalc { id: string; opId: string; kind: string; cents: number; currency: string; createdAt: number; inputs: Record<string, unknown> }
export interface DLine { id: string; invoiceId: string; opId: string | null; kind: string | null; cents: number; taxCents: number; description: string }
export interface DInvoice { id: string; number: string; kind: "INVOICE" | "CREDIT_NOTE"; partyId: string; issueDate: string; currency: string; cents: number; taxCents: number; status: string; disputedCents: number; disputeNote: string | null; correctsId: string | null; lines: DLine[] }
export interface DPayment { id: string; partyId: string; date: string; currency: string; cents: number; reference: string | null; matches: { invoiceId: string; cents: number }[] }
export interface DCost { id: string; day: string; category: string; nature: "ACTUAL" | "ESTIMATE" | "ALLOCATED"; currency: string; cents: number; opId: string | null; assetId: string | null; teamKey: string | null; description: string | null; allocationBasis: string | null }
export interface DDev { opId: string; category: string; minutes: number | null; note: string | null; responsibility: string | null }
export interface DManual { lineId: string; targetType: "ASSET" | "PERSONNEL"; targetId: string; share: number; reason: string; approvedBy: string; version: number }

export type AllocMethod = "DURATION" | "WEIGHTS";
export interface AllocSettings { method: AllocMethod; roleWeights: Record<string, number>; version: number; approvedBy: string; note: string }
export const DEFAULT_ALLOC: AllocSettings = { method: "DURATION", roleWeights: { KAPTAN: 1, BASCARKCI: 1, YAGCI: 1, PIMCI: 1, KILAVUZ: 1 }, version: 1, approvedBy: "seed", note: "Gerçek hizmet süresine göre (varsayılan)" };

export interface Dataset {
  asOf: number;
  ops: DOp[]; persons: DPerson[]; assets: DAsset[]; shifts: DShift[]; parts: DPart[]; plans: DPlan[];
  downtime: DDown[]; meters: DMeter[]; calcs: DCalc[]; invoices: DInvoice[]; payments: DPayment[]; costs: DCost[]; devs: DDev[]; manual: DManual[];
  parties: Record<string, string>; facilities: Record<string, string>; teamOfPerson: Record<string, string | null>; teamAsset: Record<string, string | null>;
  alloc: AllocSettings; night: NightWindow; lastUpdates: Record<string, number | null>;
}

// ───────── Filtre ─────────
export type Grain = "day" | "week" | "month" | "quarter" | "year";
export type DateBasis = "SERVICE" | "SHIFT" | "ACCRUAL" | "INVOICE" | "COLLECTION";
export interface Filter {
  from: number; to: number; grain: Grain; basis: DateBasis;
  personnelIds?: string[]; crewRoles?: string[]; teamKeys?: string[]; shiftMode?: "DAY" | "NIGHT";
  assetIds?: string[]; assetTypes?: string[]; opTypes?: string[]; vesselIds?: string[]; partyIds?: string[]; agentIds?: string[]; facilityIds?: string[];
  priority?: string[]; opStatus?: string[]; accrualStatus?: string[]; accountingStatus?: string[]; collection?: "PAID" | "OPEN" | "DISPUTED"; cancelled?: boolean; tariffVersionIds?: string[];
}
export const BASIS_LABEL: Record<DateBasis, string> = { SERVICE: "Hizmet tarihi", SHIFT: "Vardiya tarihi", ACCRUAL: "Tahakkuk tarihi", INVOICE: "Fatura tarihi", COLLECTION: "Tahsilat tarihi" };
export const GRAIN_LABEL: Record<Grain, string> = { day: "Gün", week: "Hafta", month: "Ay", quarter: "Çeyrek", year: "Yıl" };

export function bucketOf(ms: number, g: Grain): string {
  const d = trDay(ms);
  if (g === "day") return d;
  if (g === "month") return d.slice(0, 7);
  if (g === "year") return d.slice(0, 4);
  if (g === "quarter") return `${d.slice(0, 4)}-Ç${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
  const t = dayStart(d), dow = (new Date(t + 3 * H).getUTCDay() + 6) % 7;
  return `H ${trDay(t - dow * DAY)}`;
}

// ───────── Operasyon ölçümleri ─────────
export interface OpTimes { serviceDate: number; actualStart: number | null; actualEnd: number | null; service: Iv[]; transit: Iv[]; waiting: { iv: Iv; reason: string | null; note: string | null }[]; night: boolean; completed: boolean }
const ev = (o: DOp, t: string) => o.events.filter((e) => e.type === t && !e.assetId && !e.kind);
export function opTimes(o: DOp, w: NightWindow = NIGHT): OpTimes {
  const first = (t: string) => o.events.filter((e) => e.type === t && !e.kind).map((e) => e.at).sort((a, b) => a - b)[0] ?? null;
  const last = (t: string) => o.events.filter((e) => e.type === t && !e.kind && !e.assetId).map((e) => e.at).sort((a, b) => b - a)[0] ?? null;
  const any = (ts: string[]) => o.events.filter((e) => ts.includes(e.type)).map((e) => e.at).sort((x, y) => x - y);
  const ss = first("SERVICE_START") ?? any(["TUG_ALONGSIDE", "PILOT_BOARDED", "MOORING_START"])[0] ?? null;
  const se = last("SERVICE_END") ?? any(["SERVICE_END", "PILOT_DISEMBARKED"]).at(-1) ?? null;
  const service: Iv[] = ss && se && se > ss ? minus([[ss, se]], pairs(o, "PAUSE_START", "PAUSE_END").map((p) => p.iv)) : [];
  const transit: Iv[] = [];
  const ts = first("TRANSIT_START"), ar = first("ARRIVED_SITE"), rs = first("RETURN_START"), re = first("RETURN_END");
  if (ts && ar && ar > ts) transit.push([ts, ar]);
  if (rs && re && re > rs) transit.push([rs, re]);
  const cancel = o.events.find((e) => e.type === "CANCEL_OR_INCOMPLETE");
  const serviceDate = se ?? cancel?.at ?? re ?? o.plannedStart ?? 0;
  const dn = service.length ? splitDayNight(service, w) : { night: 0, total: 0 };
  return { serviceDate, actualStart: ss, actualEnd: se, service, transit, waiting: pairs(o, "WAIT_START", "WAIT_END"), night: dn.total > 0 && dn.night * 2 >= dn.total, completed: o.opStatus === "COMPLETED" || o.opStatus === "PARTIAL" };
}
function pairs(o: DOp, a: string, b: string) {
  const s = ev(o, a).sort((x, y) => x.at - y.at), e = ev(o, b).sort((x, y) => x.at - y.at);
  return s.map((x, i) => ({ iv: [x.at, e[i]?.at ?? x.at] as Iv, reason: x.reason ?? null, note: x.note ?? null })).filter((p) => p.iv[1] > p.iv[0]);
}

// ───────── Kapsam ─────────
export function makeScope(ds: Dataset, f: Filter) {
  const times = new Map(ds.ops.map((o) => [o.id, opTimes(o, ds.night)]));
  const partsByOp = groupBy(ds.parts, (p) => p.opId);
  const personSet = f.personnelIds?.length ? new Set(f.personnelIds) : null;
  const personFilter = (p: DPerson) => (!personSet || personSet.has(p.id)) && (!f.crewRoles?.length || f.crewRoles.includes(p.crewRole ?? "")) && (!f.teamKeys?.length || f.teamKeys.includes(p.teamKey ?? ""));
  const persons = ds.persons.filter(personFilter);
  const assets = ds.assets.filter((a) => (!f.assetIds?.length || f.assetIds.includes(a.id)) && (!f.assetTypes?.length || f.assetTypes.includes(a.type)));
  const resourceFiltered = !!(f.personnelIds?.length || f.crewRoles?.length || f.teamKeys?.length || f.assetIds?.length || f.assetTypes?.length);
  const pIds = new Set(persons.map((p) => p.id)), aIds = new Set(assets.map((a) => a.id));
  const opAttr = (o: DOp) => {
    const t = times.get(o.id)!;
    if (f.opTypes?.length && !f.opTypes.includes(o.typeCode)) return false;
    if (f.vesselIds?.length && !f.vesselIds.includes(o.vesselId)) return false;
    if (f.partyIds?.length && !f.partyIds.includes(o.billingPartyId ?? "")) return false;
    if (f.agentIds?.length && !f.agentIds.includes(o.agentPartyId ?? "")) return false;
    if (f.facilityIds?.length && !f.facilityIds.includes(o.facilityId ?? "")) return false;
    if (f.priority?.length && !f.priority.includes(o.priority)) return false;
    if (f.opStatus?.length && !f.opStatus.includes(o.opStatus)) return false;
    if (f.accrualStatus?.length && !f.accrualStatus.includes(o.accrualStatus)) return false;
    if (f.accountingStatus?.length && !f.accountingStatus.includes(o.accountingStatus)) return false;
    if (f.cancelled && o.opStatus !== "CANCELLED" && o.opStatus !== "PARTIAL") return false;
    if (f.tariffVersionIds?.length && !f.tariffVersionIds.includes(o.tariffVersionId ?? "")) return false;
    if (f.shiftMode && (f.shiftMode === "NIGHT") !== t.night) return false;
    if (f.collection) {
      const x = opFinance(ds, o.id);
      if (f.collection === "PAID" && !(x.invoiceIds.length && x.open === 0)) return false;
      if (f.collection === "OPEN" && !(x.invoiceIds.length && x.open > 0)) return false;
      if (f.collection === "DISPUTED" && !(x.disputed > 0)) return false;
    }
    if (resourceFiltered && !(partsByOp.get(o.id) ?? []).some((p) => (p.personnelId && pIds.has(p.personnelId)) || (p.assetId && aIds.has(p.assetId)))) return false;
    return true;
  };
  const inRange = (ms: number) => ms >= f.from && ms < f.to;
  const opsAttr = ds.ops.filter(opAttr);
  const ops = opsAttr.filter((o) => inRange(times.get(o.id)!.serviceDate));
  const shiftsByPerson = groupBy(ds.shifts, (x) => x.personnelId), partsByPerson = groupBy(ds.parts, (x) => x.personnelId);
  const partsByAsset = groupBy(ds.parts.filter((x) => !x.personnelId), (x) => x.assetId), shiftsByAsset = groupBy(ds.shifts, (x) => x.assetId);
  const opById = new Map(ds.ops.map((o) => [o.id, o]));
  return { ds, f, times, partsByOp, persons, assets, ops, opsAttr, inRange, resourceFiltered, shiftsByPerson, partsByPerson, partsByAsset, shiftsByAsset, opById };
}
export type Scope = ReturnType<typeof makeScope>;

function groupBy<T>(xs: T[], k: (x: T) => string | null | undefined) { const m = new Map<string, T[]>(); for (const x of xs) { const key = k(x); if (key == null) continue; const l = m.get(key); if (l) l.push(x); else m.set(key, [x]); } return m; }

// ───────── Finans ─────────
export interface OpFinance { estimate: number | null; accrual: number | null; accrualApproved: boolean; invoiced: number; credit: number; net: number; tax: number; collected: number; open: number; disputed: number; invoiceIds: string[]; currency: string }
export function opFinance(ds: Dataset, opId: string): OpFinance {
  const calcs = ds.calcs.filter((c) => c.opId === opId).sort((a, b) => b.createdAt - a.createdAt);
  const op = ds.ops.find((o) => o.id === opId)!;
  const est = calcs.find((c) => c.kind === "ESTIMATE"), fin = calcs.find((c) => c.kind === "FINAL");
  const lines = ds.invoices.flatMap((i) => i.lines.filter((l) => l.opId === opId).map((l) => ({ l, i })));
  const invoiced = lines.filter((x) => x.i.kind === "INVOICE" && x.i.status !== "CANCELLED").reduce((s, x) => s + x.l.cents, 0);
  const credit = lines.filter((x) => x.i.kind === "CREDIT_NOTE").reduce((s, x) => s + x.l.cents, 0);
  const tax = lines.reduce((s, x) => s + x.l.taxCents, 0);
  const invIds = [...new Set(lines.map((x) => x.i.id))];
  // Tahsilat: yalnız fatura eşleşmesi üzerinden; çok operasyonlu faturada satır payına göre
  let collected = 0, disputed = 0;
  for (const id of invIds) {
    const inv = ds.invoices.find((i) => i.id === id)!;
    const share = inv.cents ? inv.lines.filter((l) => l.opId === opId).reduce((s, l) => s + l.cents, 0) / inv.cents : 0;
    collected += Math.round(ds.payments.flatMap((p) => p.matches).filter((m) => m.invoiceId === id).reduce((s, m) => s + m.cents, 0) * share);
    disputed += Math.round(inv.disputedCents * share);
  }
  const gross = invoiced + credit + tax;
  return { estimate: est?.cents ?? null, accrual: fin?.cents ?? null, accrualApproved: op.accrualStatus === "APPROVED" && !!fin, invoiced, credit, net: invoiced + credit, tax, collected, open: Math.max(0, gross - collected), disputed, invoiceIds: invIds, currency: fin?.currency ?? "TRY" };
}

export interface FinanceSummary {
  currency: string; basis: DateBasis;
  estimate: number; accrual: number; unbilledAccrual: number; invoiced: number; credit: number; net: number; tax: number; collected: number; open: number; disputed: number;
  unmatchedPayments: number; opsCount: number; invoiceDiff: { opId: string; ref: string; accrual: number; net: number }[];
  byCurrency: Record<string, number>;
}
/** Tarih esasına göre finansal özet. Hizmet esasında geç kesilen fatura ilgili hizmet dönemine bağlanır. */
export function financeSummary(sc: Scope): FinanceSummary {
  const { ds, f } = sc;
  const opIds = new Set(sc.opsAttr.map((o) => o.id));
  const s: FinanceSummary = { currency: "TRY", basis: f.basis, estimate: 0, accrual: 0, unbilledAccrual: 0, invoiced: 0, credit: 0, net: 0, tax: 0, collected: 0, open: 0, disputed: 0, unmatchedPayments: 0, opsCount: 0, invoiceDiff: [], byCurrency: {} };
  const inR = (ymd: string) => sc.inRange(dayStart(ymd) + 12 * H);
  if (f.basis === "SERVICE" || f.basis === "SHIFT") {
    for (const o of sc.ops) {
      const x = opFinance(ds, o.id);
      s.opsCount++;
      s.estimate += x.estimate ?? 0; if (x.accrualApproved) s.accrual += x.accrual ?? 0;
      if (x.accrualApproved && !x.invoiceIds.length) s.unbilledAccrual += x.accrual ?? 0;
      s.invoiced += x.invoiced; s.credit += x.credit; s.net += x.net; s.tax += x.tax; s.collected += x.collected; s.open += x.open; s.disputed += x.disputed;
      if (x.accrualApproved && x.invoiceIds.length && Math.abs(x.invoiced - (x.accrual ?? 0)) > Math.max(100, Math.abs(x.accrual ?? 0) * 0.005)) s.invoiceDiff.push({ opId: o.id, ref: o.ref, accrual: x.accrual ?? 0, net: x.invoiced });
    }
  } else if (f.basis === "ACCRUAL") {
    for (const c of ds.calcs.filter((c) => c.kind === "FINAL" && opIds.has(c.opId) && sc.inRange(c.createdAt))) {
      const o = ds.ops.find((x) => x.id === c.opId)!;
      if (o.accrualStatus !== "APPROVED") continue;
      s.opsCount++; s.accrual += c.cents;
      const x = opFinance(ds, o.id);
      if (!x.invoiceIds.length) s.unbilledAccrual += c.cents;
    }
  } else if (f.basis === "INVOICE") {
    for (const inv of ds.invoices.filter((i) => inR(i.issueDate) && i.status !== "CANCELLED")) {
      const lines = inv.lines.filter((l) => !l.opId || opIds.has(l.opId));
      const net = lines.reduce((a, l) => a + l.cents, 0), tax = lines.reduce((a, l) => a + l.taxCents, 0);
      if (inv.kind === "INVOICE") s.invoiced += net; else s.credit += net;
      s.net += net; s.tax += tax; s.disputed += inv.disputedCents;
      s.byCurrency[inv.currency] = (s.byCurrency[inv.currency] ?? 0) + net;
    }
  } else if (f.basis === "COLLECTION") {
    for (const p of ds.payments.filter((p) => inR(p.date))) {
      const matched = p.matches.reduce((a, m) => a + m.cents, 0);
      s.collected += matched; s.unmatchedPayments += p.cents - matched;
    }
  }
  if (f.basis !== "INVOICE") s.byCurrency = { TRY: s.net };
  return s;
}

// ───────── Gelir dağıtımı (mükerrer sayım yok) ─────────
export interface Allocation { targetType: "ASSET" | "PERSONNEL"; targetId: string; lineId: string; opId: string; cents: number; method: string }
export interface AllocResult { rows: Allocation[]; unallocated: { lineId: string; opId: string | null; cents: number; reason: string }[]; sourceCents: number; allocatedCents: number; methodNote: string }
const assetKinds = (k: string | null) => (k === "MOORING" || k === "UNMOORING" ? ["MOORING_BOAT"] : k === "TOWAGE" || k === "STANDBY_TUG" ? ["TUG"] : []);
const personKinds = (k: string | null) => (k === "PILOTAGE" ? ["KILAVUZ"] : k === "TOWAGE" || k === "STANDBY_TUG" ? ["KAPTAN", "BASCARKCI", "YAGCI", "PIMCI"] : []);

export function allocateRevenue(ds: Dataset, lines: DLine[], dim: "ASSET" | "PERSONNEL"): AllocResult {
  const assetType = new Map(ds.assets.map((a) => [a.id, a.type]));
  const role = new Map(ds.persons.map((p) => [p.id, p.crewRole ?? ""]));
  const partsByOp = groupBy(ds.parts, (p) => p.opId);
  const res: AllocResult = { rows: [], unallocated: [], sourceCents: 0, allocatedCents: 0, methodNote: ds.alloc.method === "DURATION" ? `Gerçek hizmet süresine göre (yöntem sürümü ${ds.alloc.version})` : `Onaylı kaynak ağırlıklarına göre (sürüm ${ds.alloc.version}: ${Object.entries(ds.alloc.roleWeights).map(([k, v]) => `${k} ${v}`).join(", ")})` };
  for (const l of lines) {
    res.sourceCents += l.cents;
    const manual = ds.manual.filter((m) => m.lineId === l.id && m.targetType === dim);
    if (manual.length) {
      const v = Math.max(...manual.map((m) => m.version));
      const cur = manual.filter((m) => m.version === v);
      for (const [k, c] of allocate(l.cents, cur.map((m) => ({ key: m.targetId, weight: m.share })))) res.rows.push({ targetType: dim, targetId: k, lineId: l.id, opId: l.opId ?? "", cents: c, method: `Elle (onay: ${cur[0].approvedBy}; gerekçe: ${cur[0].reason})` });
      res.allocatedCents += l.cents; continue;
    }
    if (!l.opId) { res.unallocated.push({ lineId: l.id, opId: null, cents: l.cents, reason: "Fatura satırı operasyona bağlı değil" }); continue; }
    const ps = (partsByOp.get(l.opId) ?? []).filter((p) => (dim === "ASSET" ? p.assetId && !p.personnelId && assetKinds(l.kind).includes(assetType.get(p.assetId) ?? "") : p.personnelId && personKinds(l.kind).includes(role.get(p.personnelId) ?? "")));
    if (!ps.length) { res.unallocated.push({ lineId: l.id, opId: l.opId, cents: l.cents, reason: dim === "ASSET" ? (l.kind === "PILOTAGE" ? "Kılavuzluk geliri araca dağıtılmaz" : "Hizmete katılan araç kaydı yok") : (l.kind === "MOORING" || l.kind === "UNMOORING" ? "Palamar hizmeti alt yükleniciyle — personele dağıtılmaz" : "Hizmete katılan personel kaydı yok") }); continue; }
    const byTarget = groupBy(ps, (p) => (dim === "ASSET" ? p.assetId : p.personnelId));
    const parts = [...byTarget].map(([k, xs]) => {
      const dur = total(xs.map((x) => [x.from, x.to] as Iv)) / MIN;
      return { key: k, weight: ds.alloc.method === "WEIGHTS" && dim === "PERSONNEL" ? dur * (ds.alloc.roleWeights[role.get(k) ?? ""] ?? 1) : dur };
    });
    const method = parts.length === 1 ? "Doğrudan ilişkilendirme" : ds.alloc.method === "WEIGHTS" && dim === "PERSONNEL" ? "Ağırlıklı süre" : "Hizmet süresi";
    for (const [k, c] of allocate(l.cents, parts)) res.rows.push({ targetType: dim, targetId: k, lineId: l.id, opId: l.opId, cents: c, method });
    res.allocatedCents += l.cents;
  }
  return res;
}
/** Kişinin/aracın katıldığı operasyonların net fatura toplamı — kişiler/araçlar arasında TOPLANAMAZ */
export function relatedNet(ds: Dataset, opIds: Iterable<string>) {
  const set = new Set(opIds);
  return ds.invoices.flatMap((i) => (i.status === "CANCELLED" ? [] : i.lines)).filter((l) => l.opId && set.has(l.opId)).reduce((s, l) => s + l.cents, 0);
}
export function linesInScope(sc: Scope): DLine[] {
  const ids = new Set(sc.ops.map((o) => o.id));
  return sc.ds.invoices.filter((i) => i.status !== "CANCELLED").flatMap((i) => i.lines).filter((l) => l.opId && ids.has(l.opId));
}

// ───────── Personel ─────────
export interface PersonStats {
  person: DPerson; planned: number; actual: number; pendingApproval: number; normal: number; overtime: number; overtimeApproved: number; night: number;
  standby: number; training: number; leave: number; leaveDays: number; active: number; transit: number; waiting: number; ops: string[]; shiftCount: number;
  missing: { shiftId: string; start: number; end: number }[]; corrections: DShift[]; overtimeReasons: string[]; overlaps: number; outsideShift: number;
  violations: Violation[]; minRest24h: number | null; minRest7d: number | null; tugs: string[]; mates: string[]; byType: Record<string, number>;
  available: boolean; dailyActual: Map<string, number>;
}
export function personStats(sc: Scope, p: DPerson): PersonStats {
  const { ds, f } = sc;
  const sh = (sc.shiftsByPerson.get(p.id) ?? []).filter((s) => s.status !== "CANCELLED");
  const win = (ivs: Iv[]) => clip(ivs, f.from, f.to);
  const cat = (c: string) => sh.filter((s) => s.category === c);
  const workPlanned = win(cat("WORK").map((s) => [s.start, s.end] as Iv));
  const actualRows = cat("WORK").filter((s) => s.actualStart != null && s.actualEnd != null);
  const approvedIv = win(actualRows.filter((s) => s.approved).map((s) => [s.actualStart!, s.actualEnd!] as Iv));
  const pendingIv = win(actualRows.filter((s) => !s.approved).map((s) => [s.actualStart!, s.actualEnd!] as Iv));
  const parts = (sc.partsByPerson.get(p.id) ?? []).filter((x) => x.to > f.from && x.from < f.to);
  const partIv = win(parts.map((x) => [x.from, x.to] as Iv));
  // Vardiya dışı fiilî görev (ör. hazır bulunmadan çağrılma) çalışmaya eklenir
  const allShiftIv = actualRows.map((s) => [s.actualStart!, s.actualEnd!] as Iv);
  const outside = minus(partIv, allShiftIv);
  const actualIv = union([...approvedIv, ...pendingIv, ...outside]);
  const overtimeIv = union([...minus(union([...approvedIv, ...pendingIv]), workPlanned), ...outside]);
  const outsideApproved = minus(win(parts.filter((x) => x.approved).map((x) => [x.from, x.to] as Iv)), allShiftIv);
  const overtimeApproved = total(intersect(overtimeIv, [...approvedIv, ...outsideApproved]));
  const standbyIv = minus(win(cat("STANDBY").map((s) => [s.start, s.end] as Iv)), partIv);
  const leaveIv = win(cat("LEAVE").map((s) => [s.start, s.end] as Iv));
  const missing = cat("WORK").filter((s) => s.actualStart == null && s.end <= ds.asOf && s.end > f.from && s.start < f.to).map((s) => ({ shiftId: s.id, start: s.start, end: s.end }));
  // Aktif hizmet / intikal / bekleme: katılım ∩ operasyon olay aralıkları
  let active = 0, transit = 0, waiting = 0;
  const ops = [...new Set(parts.map((x) => x.opId))];
  const byType: Record<string, number> = {};
  for (const opId of ops) {
    const t = sc.times.get(opId); if (!t) continue;
    const mine = win(parts.filter((x) => x.opId === opId).map((x) => [x.from, x.to] as Iv));
    active += total(intersect(mine, minus(t.service, t.waiting.map((w) => w.iv))));
    transit += total(intersect(mine, t.transit));
    waiting += total(intersect(mine, t.waiting.map((w) => w.iv)));
    const o = sc.opById.get(opId); if (o) byType[o.typeCode] = (byType[o.typeCode] ?? 0) + 1;
  }
  const ivsForRest: Interval[] = [
    ...sh.filter((s) => s.category !== "WORK").map((s) => ({ start: s.start, end: s.end, category: s.category as Interval["category"] })),
    ...union([...actualRows.map((s) => [s.actualStart!, s.actualEnd!] as Iv), ...cat("WORK").filter((s) => s.actualStart == null).map((s) => [s.start, s.end] as Iv), ...outside]).map(([a, b]) => ({ start: a, end: b, category: "WORK" as const })),
  ];
  const evn = restCached(p.workProfile, ivsForRest, f.from, f.to);
  const mates = new Set<string>(), tugs = new Set<string>();
  for (const x of parts) { if (x.assetId) tugs.add(x.assetId); for (const y of sc.partsByOp.get(x.opId) ?? []) if (y.personnelId && y.personnelId !== p.id && y.from < x.to && x.from < y.to) mates.add(y.personnelId); }
  const overlaps = overlapsOf(parts.map((x) => ({ iv: [x.from, x.to] as Iv, x }))).filter(([a, b]) => a.x.opId !== b.x.opId).length;
  const planned = total(workPlanned), leave = total(leaveIv);
  return {
    person: p, planned, actual: total(actualIv), pendingApproval: total(pendingIv), normal: total(actualIv) - total(overtimeIv), overtime: total(overtimeIv), overtimeApproved,
    night: splitDayNight(actualIv, ds.night).night, standby: total(standbyIv), training: total(win(cat("TRAINING").map((s) => [s.start, s.end] as Iv))), leave, leaveDays: Math.round(leave / DAY * 10) / 10,
    active, transit, waiting, ops, shiftCount: cat("WORK").filter((s) => s.start < f.to && s.end > f.from).length, missing,
    corrections: actualRows.filter((s) => s.actualSource === "MANUAL_CORRECTION" && s.start < f.to && s.end > f.from),
    overtimeReasons: [...new Set(actualRows.filter((s) => s.overtimeReason && s.start < f.to && s.end > f.from).map((s) => s.overtimeReason!))],
    overlaps, outsideShift: total(outside), violations: evn.violations, minRest24h: evn.metrics.minRest24h, minRest7d: evn.metrics.minRest7d,
    tugs: [...tugs], mates: [...mates], byType, available: planned > 0 || total(actualIv) > 0, dailyActual: byDay(actualIv),
  };
}

/** Dinlenme değerlendirmesi önbelleği — anahtar girdilerin tamamıdır; veri değişirse anahtar değişir */
const REST_CACHE = new Map<string, ReturnType<typeof evaluate>>();
function restCached(profile: string, ivs: Interval[], from: number, to: number) {
  const key = `${profile}|${from}|${to}|${ivs.map((x) => `${x.category[0]}${x.start.toString(36)}-${x.end.toString(36)}`).sort().join(",")}`;
  const hit = REST_CACHE.get(key);
  if (hit) return hit;
  const r = evaluate(ivs, profileByCode(profile), from, to);
  if (REST_CACHE.size > 3000) REST_CACHE.delete(REST_CACHE.keys().next().value!);
  REST_CACHE.set(key, r);
  return r;
}

// ───────── Araç (römorkör) ─────────
export interface AssetStats {
  asset: DAsset; plannedAvailable: number; available: number; down: Record<string, number>; downTotal: number; active: number; transit: number; waiting: number; standby: number;
  participation: number; day: number; night: number; ops: string[]; engineHours: number | null; engineMeasuredDays: number; fuelMeasured: number; fuelEstimated: number;
  plannedHours: number; utilization: number | null; billedUnits: number;
}
export function assetStats(sc: Scope, a: DAsset): AssetStats {
  const { ds, f } = sc;
  const win = (ivs: Iv[]) => clip(ivs, f.from, f.to);
  const dutyIv = win((sc.shiftsByAsset.get(a.id) ?? []).filter((s) => s.category === "WORK" && s.status !== "CANCELLED").map((s) => [s.start, s.end] as Iv));
  const downs = ds.downtime.filter((d) => d.assetId === a.id);
  const downIv = win(downs.map((d) => [d.from, d.to] as Iv));
  const parts = (sc.partsByAsset.get(a.id) ?? []).filter((x) => x.to > f.from && x.from < f.to);
  const partIv = win(parts.map((x) => [x.from, x.to] as Iv));
  const ops = [...new Set(parts.map((x) => x.opId))];
  let active = 0, transit = 0, waiting = 0;
  for (const opId of ops) {
    const t = sc.times.get(opId); if (!t) continue;
    const mine = win(parts.filter((x) => x.opId === opId).map((x) => [x.from, x.to] as Iv));
    active += total(intersect(mine, minus(t.service, t.waiting.map((w) => w.iv))));
    transit += total(intersect(mine, t.transit));
    waiting += total(intersect(mine, t.waiting.map((w) => w.iv)));
  }
  const planBase = a.type === "TUG" ? dutyIv : win([[f.from, f.to]]);
  const available = total(minus(planBase, downIv));
  const dn = splitDayNight(partIv, ds.night);
  const down: Record<string, number> = {};
  for (const d of downs) down[d.kind] = (down[d.kind] ?? 0) + total(win([[d.from, d.to]]));
  const days = new Set<string>(); for (let t = f.from; t < f.to; t += DAY) days.add(trDay(t));
  const meters = ds.meters.filter((m) => m.assetId === a.id && days.has(m.day));
  const plannedHours = total(win(ds.plans.filter((p) => p.assetId === a.id).map((p) => [p.from, p.to] as Iv)));
  const billedUnits = sc.ops.filter((o) => ops.includes(o.id)).length;
  return {
    asset: a, plannedAvailable: total(planBase), available, down, downTotal: total(downIv), active, transit, waiting, standby: Math.max(0, total(minus(minus(planBase, downIv), partIv))),
    participation: total(partIv), day: dn.day, night: dn.night, ops, engineHours: meters.length ? meters.reduce((s, m) => s + (m.engineHours ?? 0), 0) : null, engineMeasuredDays: meters.length,
    fuelMeasured: meters.filter((m) => m.measured).reduce((s, m) => s + (m.fuel ?? 0), 0), fuelEstimated: meters.filter((m) => !m.measured).reduce((s, m) => s + (m.fuel ?? 0), 0),
    plannedHours, utilization: available > 0 ? (active + transit + waiting) / available : null, billedUnits,
  };
}

// ───────── Maliyet ve sonuç ─────────
export const COST_LABEL: Record<string, string> = { PERSONNEL: "Personel", OVERTIME: "Fazla mesai", FUEL: "Yakıt", SUBCONTRACT: "Alt yüklenici", OP_SPECIFIC: "Operasyona özel", MAINTENANCE: "Bakım/onarım", OVERHEAD: "Genel gider (dağıtılmış)" };
export const NATURE_LABEL: Record<string, string> = { ACTUAL: "Gerçekleşen", ESTIMATE: "Tahmini", ALLOCATED: "Dağıtılmış" };
export const DIRECT_CATS = ["SUBCONTRACT", "OP_SPECIFIC", "FUEL", "OVERTIME"];
export const REQUIRED_CATS = ["PERSONNEL", "FUEL", "MAINTENANCE", "OVERHEAD"];
export interface ResultRow { key: string; label: string; revenue: number; direct: number; contribution: number; allocated: number; result: number; estimateShare: number; costByCat: Record<string, number> }
export interface ResultSet { rows: ResultRow[]; total: ResultRow; complete: boolean; missingCats: string[]; estimateCents: number; label: string; scopeNote: string; unassignedCost: number }

/** Maliyetleri operasyonlara bağlar: doğrudan (operasyonlu kayıt), yakıt (araç-gün katılım süresine göre), personel/fazla mesai (ekip-ay kişi-saatine göre), genel gider (römorkör saatine göre). */
export function costByOp(sc: Scope) {
  const { ds, f } = sc;
  const costs = ds.costs.filter((c) => sc.inRange(dayStart(c.day) + 12 * H));
  const out = new Map<string, Record<string, number>>(); const est = new Map<string, number>();
  const add = (op: string, cat: string, c: number, isEst: boolean) => { const r = out.get(op) ?? {}; r[cat] = (r[cat] ?? 0) + c; out.set(op, r); if (isEst) est.set(op, (est.get(op) ?? 0) + c); };
  let unassigned = 0;
  const assetDayParts = groupBy(ds.parts.filter((p) => p.assetId && !p.personnelId), (p) => `${p.assetId}|${trDay(p.from)}`);
  const teamOf = ds.teamOfPerson;
  const personMonthParts = groupBy(ds.parts.filter((p) => p.personnelId), (p) => `${teamOf[p.personnelId!] ?? (ds.persons.find((x) => x.id === p.personnelId)?.crewRole === "KILAVUZ" ? "PILOTS" : "")}|${trDay(p.from).slice(0, 7)}`);
  const tugParts = ds.parts.filter((p) => p.assetId && !p.personnelId && ds.assets.find((a) => a.id === p.assetId)?.type === "TUG");
  for (const c of costs) {
    const isEst = c.nature === "ESTIMATE";
    if (c.opId) { add(c.opId, c.category, c.cents, isEst); continue; }
    let parts: { key: string; weight: number }[] = [];
    if (c.category === "FUEL" && c.assetId) parts = (assetDayParts.get(`${c.assetId}|${c.day}`) ?? []).map((p) => ({ key: p.opId, weight: (p.to - p.from) / MIN }));
    else if ((c.category === "PERSONNEL" || c.category === "OVERTIME") && c.teamKey) {
      const month = c.day.slice(0, 7);
      // Ekibin aylık toplam vardiya kapasitesine göre: görevde geçen kişi-saat operasyona, kalanı hazır bekleme maliyetidir
      const members = Object.entries(teamOf).filter(([, t]) => t === c.teamKey).map(([pid]) => pid);
      const pilotIds = c.teamKey === "PILOTS" ? ds.persons.filter((p) => p.crewRole === "KILAVUZ").map((p) => p.id) : [];
      const ids = new Set([...members, ...pilotIds]);
      const capacity = ds.shifts.filter((s) => ids.has(s.personnelId) && s.category === "WORK" && trDay(s.start).slice(0, 7) === month).reduce((s, x) => s + ((x.actualEnd ?? x.end) - (x.actualStart ?? x.start)) / MIN, 0);
      const ps = (personMonthParts.get(`${c.teamKey}|${month}`) ?? []).map((p) => ({ key: p.opId, weight: (p.to - p.from) / MIN }));
      const used = ps.reduce((s, p) => s + p.weight, 0);
      parts = [...ps, ...(capacity > used ? [{ key: "__idle", weight: capacity - used }] : [])];
    } else if (c.category === "OVERHEAD") parts = tugParts.filter((p) => trDay(p.from).slice(0, 7) === c.day.slice(0, 7)).map((p) => ({ key: p.opId, weight: (p.to - p.from) / MIN }));
    if (!parts.length) { unassigned += c.cents; continue; }
    for (const [k, v] of allocate(c.cents, parts)) { if (k === "__idle") unassigned += v; else add(k, c.category, v, isEst); }
  }
  return { byOp: out, estByOp: est, unassigned, costs, f };
}

export function results(sc: Scope, groupKey: (o: DOp) => { key: string; label: string }): ResultSet {
  const { ds } = sc;
  const cb = costByOp(sc);
  const rows = new Map<string, ResultRow>();
  for (const o of sc.ops) {
    const g = groupKey(o);
    const r = rows.get(g.key) ?? { key: g.key, label: g.label, revenue: 0, direct: 0, contribution: 0, allocated: 0, result: 0, estimateShare: 0, costByCat: {} };
    r.revenue += opFinance(ds, o.id).net;
    const c = cb.byOp.get(o.id) ?? {};
    for (const [cat, v] of Object.entries(c)) { r.costByCat[cat] = (r.costByCat[cat] ?? 0) + v; if (DIRECT_CATS.includes(cat)) r.direct += v; else r.allocated += v; }
    r.estimateShare += cb.estByOp.get(o.id) ?? 0;
    rows.set(g.key, r);
  }
  const list = [...rows.values()].map((r) => { r.contribution = r.revenue - r.direct; r.result = r.contribution - r.allocated; const tot = r.direct + r.allocated; r.estimateShare = tot ? r.estimateShare / tot : 0; return r; }).sort((a, b) => b.revenue - a.revenue);
  const T: ResultRow = { key: "_", label: "Toplam", revenue: 0, direct: 0, contribution: 0, allocated: 0, result: 0, estimateShare: 0, costByCat: {} };
  let estC = 0;
  for (const r of list) { T.revenue += r.revenue; T.direct += r.direct; T.allocated += r.allocated; for (const [k, v] of Object.entries(r.costByCat)) T.costByCat[k] = (T.costByCat[k] ?? 0) + v; estC += r.estimateShare * (r.direct + r.allocated); }
  T.contribution = T.revenue - T.direct; T.result = T.contribution - T.allocated; T.estimateShare = T.direct + T.allocated ? estC / (T.direct + T.allocated) : 0;
  const present = new Set(cb.costs.map((c) => c.category));
  const missingCats = REQUIRED_CATS.filter((c) => !present.has(c));
  const complete = missingCats.length === 0 && estC === 0;
  return {
    rows: list, total: T, complete, missingCats, estimateCents: Math.round(estC), unassignedCost: cb.unassigned,
    label: complete ? "Dağıtılmış gider sonrası analitik sonuç" : "Analitik sonuç — eksik veya tahmini maliyet içerir",
    scopeNote: `Gelir: vergi hariç net fatura (iade dahil). Doğrudan maliyet: ${DIRECT_CATS.map((c) => COST_LABEL[c]).join(", ")}. Dağıtılan: personel (ekip-ay kişi-saatine göre), bakım, genel gider (römorkör saatine göre). Operasyona bağlanamayan maliyet (hazır bekleme kapasitesi vb.) ayrı gösterilir; bu bir muhasebe kâr/zarar tablosu değildir.`,
  };
}

// ───────── Plan – gerçekleşen ─────────
export const DEV_LABEL: Record<string, string> = { CUSTOMER_PREP: "Müşteri / gemi hazırlığı", FACILITY_PREP: "Tesis hazırlığı", WEATHER: "Hava / deniz koşulları", TECH_FAILURE: "Teknik arıza", EMERGENCY_TASK: "Zorunlu acil görev", PLAN_CHANGE: "Plan değişikliği", DECLARATION_CHANGE: "Beyan değişikliği", MISSING_INFO: "Eksik bilgi", OTHER: "Diğer (açıklamalı)" };
export interface PlanRow { op: DOp; plannedStart: number | null; actualStart: number | null; startDelay: number | null; plannedDur: number | null; actualDur: number | null; plannedTugs: number; actualTugs: number; estimate: number | null; final: number | null; reasons: DDev[] }
export function planActual(sc: Scope): PlanRow[] {
  return sc.ops.map((o) => {
    const t = sc.times.get(o.id)!, fin = opFinance(sc.ds, o.id);
    const actualTugs = new Set((sc.partsByOp.get(o.id) ?? []).filter((p) => p.assetId && !p.personnelId && sc.ds.assets.find((a) => a.id === p.assetId)?.type === "TUG").map((p) => p.assetId)).size;
    return { op: o, plannedStart: o.plannedStart, actualStart: t.actualStart, startDelay: o.plannedStart && t.actualStart ? t.actualStart - o.plannedStart : null, plannedDur: o.plannedStart && o.plannedEnd ? o.plannedEnd - o.plannedStart : null, actualDur: t.actualStart && t.actualEnd ? t.actualEnd - t.actualStart : null, plannedTugs: o.plannedTugs, actualTugs, estimate: fin.estimate, final: fin.accrual, reasons: sc.ds.devs.filter((d) => d.opId === o.id) };
  });
}

// ───────── Ölçüm sözlüğü ─────────
export const ANALYTICS_GLOSSARY: { key: string; label: string; def: string }[] = [
  { key: "planned", label: "Planlanan vardiya", def: "Personelin planlanan görev aralığı (vardiya kaydı)." },
  { key: "actual", label: "Gerçekleşen çalışma", def: "Fiilî çalışma kayıtları (onaylı + onay bekleyen ayrı gösterilir) ve vardiya dışındaki fiilî görev katılımı; çakışan aralıklar bir kez sayılır." },
  { key: "active", label: "Aktif hizmet", def: "Hizmet başlangıç–bitiş olaylarından, duraklama ve bekleme düşülerek hesaplanan süre." },
  { key: "transit", label: "İntikal", def: "Göreve gidiş (intikal başlangıcı → sahaya varış) ve dönüş hareketleri." },
  { key: "waiting", label: "Bekleme", def: "Nedeni kayıtlı bekleme aralıkları (bekleme başladı → bitti)." },
  { key: "standby", label: "Hazır bulunma", def: "Göreve hazır bulunulan fakat aktif hizmet/intikal/bekleme olmayan süre. Çalışma mı dinlenme mi sayılacağı onaylı kurala bağlıdır (R-029)." },
  { key: "down", label: "Bakım/arızada kalma", def: "Aracın teknik nedenlerle kullanılamadığı kayıtlı süre." },
  { key: "training", label: "Eğitim ve diğer görev", def: "Operasyon dışındaki kayıtlı çalışma." },
  { key: "billed", label: "Ücretlendirilen süre/miktar", def: "İlgili tarifeye göre hesaplanan ticari miktar; motor saati veya operasyon saatiyle aynı ölçüm değildir." },
  { key: "rest", label: "Dinlenme", def: "Kişinin çalışma profiline göre (STCW/MLC veya İş Kanunu) kayan pencerelerde değerlendirilen dinlenme." },
  { key: "overtime", label: "Fazla mesai", def: "Planlanan vardiya dışına taşan gerçekleşen çalışma + vardiya dışı görev katılımı. Onaylı kısım ayrıca gösterilir." },
  { key: "related", label: "Katıldığı operasyonların net fatura toplamı", def: "Kişinin/aracın katıldığı işlerin net faturası. Ticari büyüklüğü gösterir; kişiler veya araçlar arasında toplanamaz." },
  { key: "allocated", label: "Dağıtılmış analitik gelir", def: "Fatura satırının onaylı yöntemle (doğrudan, hizmet süresi, ağırlık veya elle) paylaştırılması; toplamı kaynak gelirle mutabıktır. Ücret, prim hakkı veya muhasebe geliri değildir." },
  { key: "net", label: "Net fatura", def: "Vergi hariç fatura tutarı, iade/düzeltme faturaları düşülmüş." },
  { key: "open", label: "Açık alacak", def: "Vergi dahil fatura (iade düşülmüş) − eşleşmiş tahsilat." },
  { key: "utilization", label: "Kullanım oranı", def: "(Aktif hizmet + intikal + bekleme) / gerçek kullanılabilir saat (görevli vardiya − bakım/arıza)." },
];

export { sumByCurrency, H, MIN, DAY };
