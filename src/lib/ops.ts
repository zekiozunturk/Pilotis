import "server-only";
import { db, schema as s } from "@/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { calculate, selectTariffVersion } from "./tariff/engine";
import { actualDuration, type ServiceKindT } from "./durations";
import { categorize, isContainerOrRoro } from "./tariff/category";
import { holidayAt } from "@/data/holidays";
import { getFxTable } from "./fx";
import type { CalcInput, CalcResult, Completion, TariffVersionInput } from "./tariff/types";

export async function nextOperationRef(year = new Date().getUTCFullYear()): Promise<string> {
  const r = await db.execute<{ last: number }>(sql`
    INSERT INTO op_seq (year, last) VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE SET last = op_seq.last + 1 RETURNING last`);
  return `OP-${year}-${String(r.rows[0].last).padStart(6, "0")}`;
}

export async function loadOperation(ref: string) {
  const [op] = await db.select().from(s.operations).where(eq(s.operations.ref, ref));
  if (!op) return null;
  const [portCall] = await db.select().from(s.portCalls).where(eq(s.portCalls.id, op.portCallId));
  const [vessel] = await db.select().from(s.vessels).where(eq(s.vessels.id, portCall.vesselId));
  const [type] = await db.select().from(s.operationTypes).where(eq(s.operationTypes.code, op.typeCode));
  const partyIds = [op.requesterPartyId, op.billingPartyId, op.guarantorPartyId, portCall.agentPartyId].filter(Boolean) as string[];
  const parties = partyIds.length ? await db.select().from(s.parties).where(inArray(s.parties.id, partyIds)) : [];
  const facIds = [op.fromFacilityId, op.toFacilityId].filter(Boolean) as string[];
  const facilities = facIds.length ? await db.select().from(s.facilities).where(inArray(s.facilities.id, facIds)) : [];
  const events = await db.select().from(s.timelineEvents).where(eq(s.timelineEvents.operationId, op.id)).orderBy(s.timelineEvents.occurredAt);
  const lines = await db.select().from(s.serviceLines).where(eq(s.serviceLines.operationId, op.id));
  const requests = await db.select().from(s.serviceRequests).where(eq(s.serviceRequests.operationId, op.id)).orderBy(s.serviceRequests.version);
  const [billing] = await db.select().from(s.billingApprovals).where(eq(s.billingApprovals.operationId, op.id));
  const calcs = await db.select().from(s.calculationResults).where(eq(s.calculationResults.operationId, op.id)).orderBy(desc(s.calculationResults.createdAt));
  const assets = await db.select().from(s.fleetAssets);
  const p = (id: string | null) => parties.find((x) => x.id === id) ?? null;
  return {
    op, portCall, vessel, type, events, lines, requests, billing, calcs, assets,
    requester: p(op.requesterPartyId), billingParty: p(op.billingPartyId), guarantor: p(op.guarantorPartyId), agent: p(portCall.agentPartyId),
    from: facilities.find((f) => f.id === op.fromFacilityId) ?? null, to: facilities.find((f) => f.id === op.toFacilityId) ?? null,
  };
}

export type LoadedOperation = NonNullable<Awaited<ReturnType<typeof loadOperation>>>;

/** Doğrulanmış GT: saha doğrulaması veya onaylı son durum katmanından. Müşteri beyanı tek başına yeterli değildir. */
export function verifiedGt(o: LoadedOperation): number | null {
  const verified = [...o.requests].reverse().find((r) => r.layer !== "CUSTOMER_DECLARED");
  const gt = (verified?.payload as { gt?: number } | undefined)?.gt;
  return typeof gt === "number" ? gt : null;
}

function completionOf(opStatus: string, cancelReason?: string | null): Completion {
  if (opStatus === "CANCELLED") return "CANCELLED_BEFORE_START";
  if (opStatus === "PARTIAL") return cancelReason === "VESSEL_NOT_READY" || cancelReason === "FACILITY_NOT_READY" || cancelReason === "DECLARATION_MISMATCH"
    ? "INCOMPLETE_STARTED_VESSEL_OR_FACILITY_CAUSE" : "INCOMPLETE_STARTED_OTHER_CAUSE";
  return "COMPLETED";
}

export async function loadTariffs(): Promise<TariffVersionInput[]> {
  const rows = await db.select().from(s.tariffVersions);
  return rows.map((r) => ({
    id: r.id, label: r.label, validFrom: r.validFrom.toISOString(), validTo: r.validTo.toISOString(), currency: r.currency,
    status: r.status, isDemo: r.isDemo, definition: r.definition as TariffVersionInput["definition"],
  }));
}

export async function ruleStatusMap() {
  const rows = await db.select({ code: s.businessRules.code, status: s.businessRules.status }).from(s.businessRules);
  return Object.fromEntries(rows.map((r) => [r.code, r.status]));
}

/**
 * mode = "actual": gerçekleşen olaylardan; mode = "estimate": teklif/taahhüt için standart varsayım
 * (saatlik hizmette 1 saat, tamamlandı, bekleme yok) — gerçekleşen süre teklif belgesini değiştirmez.
 */
export async function computeOperation(o: LoadedOperation, mode: "actual" | "estimate" = "actual"): Promise<{ results: CalcResult[]; error?: string }> {
  const tariffs = await loadTariffs();
  const statuses = await ruleStatusMap();
  const firstStart = o.events.find((e) => ["PILOT_BOARDED", "TUG_ALONGSIDE", "MOORING_START"].includes(e.type))?.occurredAt;
  const serviceDate = ((mode === "estimate" ? o.op.plannedStart : firstStart ?? o.op.plannedStart) ?? new Date()).toISOString();
  let version: TariffVersionInput;
  try { version = selectTariffVersion(tariffs, serviceDate); } catch (e) { return { results: [], error: (e as Error).message }; }
  // Sefer niteliği: son beyan katmanı > liman uğrağı kaydı
  const lastDecl = (o.requests.at(-1)?.payload ?? {}) as { isCabotage?: boolean | null; isLinerService?: boolean | null; dgClass?: string | null };
  const isCabotage = lastDecl.isCabotage ?? o.portCall.isCabotage ?? null;
  const dgClass = lastDecl.dgClass ?? o.portCall.dgClass ?? null;
  const category = categorize({ vesselType: o.vessel.vesselType, isCabotage, isLinerService: lastDecl.isLinerService ?? o.portCall.isLinerService ?? null });
  const conds: string[] = [];
  if (isCabotage) conds.push("CABOTAGE"); // yalnız örnek tarifede tanımlı
  if (o.portCall.repairPurpose && ["OP-005", "OP-006"].includes(o.op.typeCode)) conds.push("REPAIR_YARD");
  if (dgClass) conds.push("DANGEROUS_CARGO", isContainerOrRoro(o.vessel.vesselType) ? "DANGEROUS_CARGO_CRP" : "DANGEROUS_CARGO_OTHER");
  if (o.vessel.flag?.toUpperCase() === "TR") conds.push("TR_FLAG");
  const holiday = holidayAt(serviceDate);
  const fx = await getFxTable(serviceDate);
  if (holiday) conds.push("HOLIDAY");
  const evs = o.events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() }));
  // tahmin modunda saha doğrulaması yoksa müşteri beyanı kullanılır (tahmini ve bağlayıcı değil); gerçekleşen hesapta yalnız doğrulanmış GT
  const declaredGt = (o.requests.find((r) => r.layer === "CUSTOMER_DECLARED")?.payload as { gt?: number } | undefined)?.gt;
  const gt = verifiedGt(o) ?? (mode === "estimate" && typeof declaredGt === "number" ? declaredGt : null);
  const results: CalcResult[] = [];
  for (const line of o.lines) {
    if (!["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING", "STANDBY_TUG"].includes(line.kind)) continue;
    let measured: number | null = null;
    let bollard: number | null = null;
    if (line.kind === "TOWAGE" || line.kind === "STANDBY_TUG") {
      const tugIds = [...new Set(evs.filter((e) => e.serviceKind === line.kind && e.assetId).map((e) => e.assetId!))];
      const durs = tugIds.map((id) => actualDuration(evs, line.kind as ServiceKindT, id).grossMinutes).filter((x): x is number => x !== null);
      measured = durs.length ? Math.max(...durs) : null;
      if (line.kind === "STANDBY_TUG") {
        // çeki gücü sertifikalı ve doğrulanmış değilse bilinmiyor sayılır (asla tahmin edilmez)
        const bp = tugIds.map((id) => o.assets.find((a) => a.id === id)).filter((a) => a?.specVerified && a.bollardPullT).map((a) => Number(a!.bollardPullT));
        bollard = bp.length ? Math.min(...bp) : null;
      }
    }
    const waiting = actualDuration(evs, (line.kind === "STANDBY_TUG" ? "TOWAGE" : line.kind) as ServiceKindT).pauseMinutes;
    const input: CalcInput = {
      operationRef: o.op.ref, serviceKind: line.kind as CalcInput["serviceKind"], serviceDate, gt,
      measuredMinutes: mode === "estimate" ? 60 : measured, allocatedUnits: line.allocatedUnits ?? 1, requestedUnits: line.billableUnits ?? 1,
      extraUnitsWrittenRequest: !!line.masterWrittenRequestDocId, conditionCodes: conds,
      completion: mode === "estimate" ? "COMPLETED" : completionOf(o.op.opStatus, line.cancelReason), waitingMinutes: mode === "estimate" ? 0 : waiting,
      tariffCategory: category.code, categoryReason: category.reason, categoryAssumed: category.assumed, bollardPullT: bollard, fx,
    };
    const r = calculate(input, version, statuses);
    if (holiday) r.rules.unshift({ ruleCode: "R-025", applied: r.rules.some((x) => x.description.startsWith("Ulusal bayram") && x.applied), description: "Tatil tespiti", reason: `${holiday.name}${holiday.verified ? "" : " (tarih Diyanet takviminden doğrulanacak)"}` });
    results.push(r);
  }
  return { results };
}

export async function dashboardData() {
  const ops = await db.select({ op: s.operations, vessel: s.vessels.name, type: s.operationTypes.nameTr })
    .from(s.operations)
    .innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId))
    .innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .innerJoin(s.operationTypes, eq(s.operationTypes.code, s.operations.typeCode))
    .orderBy(desc(s.operations.createdAt));
  const fleet = await db.select().from(s.fleetAssets);
  const rules = await db.select().from(s.businessRules);
  const issues = await db.select().from(s.openIssues).where(eq(s.openIssues.closed, false));
  return { ops, fleet, rules, issues };
}

export async function recordAudit(entity: string, entityId: string, action: string, after: unknown, actorId?: string, reason?: string) {
  await db.insert(s.auditLog).values({ entity, entityId, action, after: after as object, actorId, reason });
}

export { and, eq };
