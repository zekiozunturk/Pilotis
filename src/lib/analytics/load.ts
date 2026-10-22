import "server-only";
import { and, eq, gte, lt, inArray, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { toCents, DAY } from "./core";
import { DEFAULT_ALLOC, type AllocSettings, type Dataset, type Filter, type DOp, type Grain, type DateBasis } from "./model";
import { DEFAULT_ALERTS, type AlertCfg } from "./insights";
import { getRotationModel } from "@/lib/planning/rotation-store";

/** Veri kümesini filtre aralığı + kenar payıyla yükler (dinlenme pencereleri ve geç kesilen faturalar için). */
export async function loadDataset(f: Pick<Filter, "from" | "to">): Promise<Dataset & { alertCfg: AlertCfg }> {
  const lo = new Date(f.from - 10 * DAY), hi = new Date(f.to + 10 * DAY);
  const [{ model: rot }, settings] = await Promise.all([getRotationModel(), db.select().from(s.appSettings).where(inArray(s.appSettings.key, ["analytics.allocation", "analytics.alerts"]))]);
  const alloc = (settings.find((x) => x.key === "analytics.allocation")?.value as AllocSettings | undefined) ?? DEFAULT_ALLOC;
  const alertCfg = { ...DEFAULT_ALERTS, ...((settings.find((x) => x.key === "analytics.alerts")?.value as Partial<AlertCfg>) ?? {}) };

  const opRows = await db.select({ o: s.operations, v: s.vessels, pc: s.portCalls, t: s.operationTypes }).from(s.operations)
    .innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .innerJoin(s.operationTypes, eq(s.operationTypes.code, s.operations.typeCode))
    .where(and(gte(s.operations.plannedStart, new Date(f.from - 40 * DAY)), lt(s.operations.plannedStart, hi)));
  const opIds = opRows.map((r) => r.o.id);
  const none = ["__none__"];
  const ids = opIds.length ? opIds : none;
  const [events, lines, parts, plans, calcs, devs, sls] = await Promise.all([
    db.select().from(s.timelineEvents).where(inArray(s.timelineEvents.operationId, ids)),
    db.select().from(s.invoiceLines).where(inArray(s.invoiceLines.operationId, ids)),
    db.select().from(s.participations).where(and(lt(s.participations.from, hi), gte(s.participations.to, lo))),
    db.select().from(s.assignments).where(inArray(s.assignments.operationId, ids)),
    db.select().from(s.calculationResults).where(inArray(s.calculationResults.operationId, ids)),
    db.select().from(s.deviations).where(inArray(s.deviations.operationId, ids)),
    db.select().from(s.serviceLines).where(inArray(s.serviceLines.operationId, ids)),
  ]);
  const invIds = [...new Set(lines.map((l) => l.invoiceId))];
  const loD = lo.toISOString().slice(0, 10), hiD = hi.toISOString().slice(0, 10);
  const invoices = await db.select().from(s.invoices).where(or(inArray(s.invoices.id, invIds.length ? invIds : none), and(gte(s.invoices.issueDate, loD), lt(s.invoices.issueDate, hiD))));
  const allLines = await db.select().from(s.invoiceLines).where(inArray(s.invoiceLines.invoiceId, invoices.length ? invoices.map((i) => i.id) : none));
  const matches = await db.select().from(s.paymentMatches).where(inArray(s.paymentMatches.invoiceId, invoices.length ? invoices.map((i) => i.id) : none));
  const payments = await db.select().from(s.payments).where(or(inArray(s.payments.id, matches.length ? matches.map((m) => m.paymentId) : none), and(gte(s.payments.receivedDate, loD), lt(s.payments.receivedDate, hiD))));
  const allMatches = await db.select().from(s.paymentMatches).where(inArray(s.paymentMatches.paymentId, payments.length ? payments.map((p) => p.id) : none));
  const [people, assets, shifts, downtime, meters, costs, manual, parties, facilities, lastAcc, lastEv] = await Promise.all([
    db.select().from(s.personnel).where(eq(s.personnel.active, true)),
    db.select().from(s.fleetAssets),
    db.select().from(s.shifts).where(and(lt(s.shifts.startAt, hi), gte(s.shifts.endAt, lo))),
    db.select().from(s.assetDowntime).where(and(lt(s.assetDowntime.from, hi), gte(s.assetDowntime.to, lo))),
    db.select().from(s.assetMeters).where(and(gte(s.assetMeters.day, loD), lt(s.assetMeters.day, hiD))),
    db.select().from(s.costEntries).where(and(gte(s.costEntries.day, loD), lt(s.costEntries.day, hiD))),
    db.select().from(s.manualAllocations),
    db.select({ id: s.parties.id, n: s.parties.legalName, short: s.parties.shortName }).from(s.parties),
    db.select({ id: s.facilities.id, n: s.facilities.name }).from(s.facilities),
    db.select({ m: sql<Date>`max(created_at)` }).from(s.invoices),
    db.select({ m: sql<Date>`max(received_at)` }).from(s.timelineEvents),
  ]);

  const tugMode = new Map<string, "DAY" | "NIGHT">(rot.tugs.map((t) => [t.id, t.mode]));
  const teamOfPerson = Object.fromEntries(people.map((p) => [p.id, p.rotationTeam]));
  const evByOp = new Map<string, typeof events>();
  for (const e of events) evByOp.set(e.operationId, [...(evByOp.get(e.operationId) ?? []), e]);
  const ops: DOp[] = opRows.map(({ o, v, pc, t }) => ({
    id: o.id, ref: o.ref, typeCode: o.typeCode, typeName: t.nameTr, vesselId: v.id, vesselName: v.name, gt: v.gt ? Number(v.gt) : null,
    billingPartyId: o.billingPartyId, agentPartyId: pc.agentPartyId, facilityId: o.toFacilityId, priority: o.priority,
    plannedStart: o.plannedStart?.getTime() ?? null, plannedEnd: o.plannedEnd?.getTime() ?? null, opStatus: o.opStatus, accrualStatus: o.accrualStatus, accountingStatus: o.accountingStatus, notifyStatus: o.notifyStatus,
    cancelReason: sls.find((x) => x.operationId === o.id && x.cancelReason)?.cancelReason ?? null, kinds: [...new Set(sls.filter((x) => x.operationId === o.id).map((x) => x.kind))],
    plannedTugs: plans.filter((p) => p.operationId === o.id && p.assetId && assets.find((a) => a.id === p.assetId)?.type === "TUG").length,
    tariffVersionId: calcs.find((c) => c.operationId === o.id)?.tariffVersionId ?? null,
    events: (evByOp.get(o.id) ?? []).map((e) => ({ type: e.type, at: e.occurredAt.getTime(), assetId: e.assetId, reason: e.reasonCode, note: e.note, kind: e.serviceKind })),
  }));
  return {
    asOf: Date.now(), alertCfg, alloc, night: { startH: 20, endH: 6 },
    ops,
    persons: people.map((p) => ({ id: p.id, name: p.fullName, title: p.title, crewRole: p.crewRole, teamKey: p.rotationTeam, unit: p.unit, photoUrl: p.photoUrl, workProfile: p.workProfile })),
    assets: assets.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, bollardPullT: a.bollardPullT ? Number(a.bollardPullT) : null, photoUrl: a.photoUrl, mode: a.code ? (tugMode.get(a.code) ?? null) : null })),
    shifts: shifts.map((x) => ({ id: x.id, personnelId: x.personnelId, category: x.category, status: x.status, start: x.startAt.getTime(), end: x.endAt.getTime(), actualStart: x.actualStartAt?.getTime() ?? null, actualEnd: x.actualEndAt?.getTime() ?? null, actualSource: x.actualSource, approved: !!x.approvedAt, overtimeReason: x.overtimeReason, correctionReason: x.correctionReason, assetId: x.assetId, operationId: x.operationId, exception: !!x.exception, note: x.note })),
    parts: parts.map((p) => ({ id: p.id, opId: p.operationId, personnelId: p.personnelId, assetId: p.assetId, role: p.roleOnTask, from: p.from.getTime(), to: p.to.getTime(), source: p.source, approved: p.approved, note: p.note })),
    plans: plans.map((p) => ({ opId: p.operationId, personnelId: p.personnelId, assetId: p.assetId, from: p.from.getTime(), to: p.to.getTime() })),
    downtime: downtime.map((d) => ({ assetId: d.assetId, kind: d.kind, from: d.from.getTime(), to: d.to.getTime(), note: d.note })),
    meters: meters.map((m) => ({ assetId: m.assetId, day: m.day, engineHours: m.engineHours ? Number(m.engineHours) : null, fuel: m.fuelLiters ? Number(m.fuelLiters) : null, measured: m.fuelMeasured })),
    calcs: calcs.map((c) => ({ id: c.id, opId: c.operationId, kind: c.kind, cents: toCents(c.netAmount), currency: c.currency, createdAt: c.createdAt.getTime(), inputs: c.inputs as Record<string, unknown> })),
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, kind: i.kind as "INVOICE", partyId: i.partyId, issueDate: i.issueDate, currency: i.currency, cents: toCents(i.netAmount), taxCents: toCents(i.taxAmount), status: i.status, disputedCents: toCents(i.disputedAmount), disputeNote: i.disputeNote, correctsId: i.correctsInvoiceId, lines: allLines.filter((l) => l.invoiceId === i.id).map((l) => ({ id: l.id, invoiceId: l.invoiceId, opId: l.operationId, kind: l.serviceKind, cents: toCents(l.netAmount), taxCents: toCents(l.taxAmount), description: l.description })) })),
    payments: payments.map((p) => ({ id: p.id, partyId: p.partyId, date: p.receivedDate, currency: p.currency, cents: toCents(p.amount), reference: p.reference, matches: allMatches.filter((m) => m.paymentId === p.id).map((m) => ({ invoiceId: m.invoiceId, cents: toCents(m.amount) })) })),
    costs: costs.map((c) => ({ id: c.id, day: c.day, category: c.category, nature: c.nature as "ACTUAL", currency: c.currency, cents: toCents(c.amount), opId: c.operationId, assetId: c.assetId, teamKey: c.teamKey, description: c.description, allocationBasis: c.allocationBasis })),
    devs: devs.map((d) => ({ opId: d.operationId, category: d.category, minutes: d.minutes, note: d.note, responsibility: d.responsibilityNote })),
    manual: manual.map((m) => ({ lineId: m.invoiceLineId, targetType: m.targetType as "ASSET", targetId: m.targetId, share: Number(m.sharePct), reason: m.reason, approvedBy: m.approvedBy, version: m.version })),
    parties: Object.fromEntries(parties.map((p) => [p.id, p.short ?? p.n])), facilities: Object.fromEntries(facilities.map((x) => [x.id, x.n])),
    teamOfPerson, teamAsset: Object.fromEntries(rot.tugs.map((t) => [t.id, t.name])),
    lastUpdates: { accounting: lastAcc[0]?.m ? new Date(lastAcc[0].m).getTime() : null, events: lastEv[0]?.m ? new Date(lastEv[0].m).getTime() : null },
  };
}

/** URL arama parametrelerinden filtre (bütün analiz ekranları aynı altyapıyı kullanır) */
export type SP = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (v ? (Array.isArray(v) ? v : v.split(",")).filter(Boolean) : undefined);
export function parseFilter(sp: SP, now = Date.now()): Filter {
  const day = (v: unknown, d: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
  const today = new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
  const defFrom = `${today.slice(0, 7)}-01`;
  const from = new Date(`${day(sp.bas, defFrom)}T00:00:00+03:00`).getTime();
  const to = new Date(`${day(sp.bit, today)}T00:00:00+03:00`).getTime() + DAY;
  const g = (sp.grup as Grain) ?? "day";
  const b = (sp.esas as DateBasis) ?? "SERVICE";
  return {
    from, to, grain: ["day", "week", "month", "quarter", "year"].includes(g) ? g : "day", basis: ["SERVICE", "SHIFT", "ACCRUAL", "INVOICE", "COLLECTION"].includes(b) ? b : "SERVICE",
    personnelIds: list(sp.personel), crewRoles: list(sp.gorev), teamKeys: list(sp.ekip), shiftMode: sp.vardiya === "DAY" || sp.vardiya === "NIGHT" ? sp.vardiya : undefined,
    assetIds: list(sp.arac), assetTypes: list(sp.sinif), opTypes: list(sp.tur), vesselIds: list(sp.gemi), partyIds: list(sp.musteri), agentIds: list(sp.acente), facilityIds: list(sp.tesis),
    priority: list(sp.oncelik), opStatus: list(sp.durum), accrualStatus: list(sp.tahakkuk), accountingStatus: list(sp.muhasebe), cancelled: sp.iptal === "1", tariffVersionIds: list(sp.tarife),
    collection: sp.tahsilat === "PAID" || sp.tahsilat === "OPEN" || sp.tahsilat === "DISPUTED" ? sp.tahsilat : undefined,
  };
}
/** Karşılaştırma dönemi: önceki eşit uzunlukta dönem veya seçilen dönem */
export function comparisonFilter(f: Filter, sp: SP): Filter | null {
  if (sp.kars === "yok") return null;
  if (typeof sp.kbas === "string" && typeof sp.kbit === "string") return { ...f, from: new Date(`${sp.kbas}T00:00:00+03:00`).getTime(), to: new Date(`${sp.kbit}T00:00:00+03:00`).getTime() + DAY };
  const len = f.to - f.from;
  return { ...f, from: f.from - len, to: f.from };
}
