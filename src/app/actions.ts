"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { canTransition, OP_STATUS_TRANSITIONS, type Role } from "@/lib/workflow";
import { computeOperation, loadOperation, nextOperationRef, recordAudit } from "@/lib/ops";
import { createHash } from "node:crypto";
import { calculate as calcEngine, selectTariffVersion as pickVersion } from "@/lib/tariff/engine";
import { loadTariffs, ruleStatusMap } from "@/lib/ops";
import type { CalcResult, CalcInput } from "@/lib/tariff/types";

export async function setRole(formData: FormData) {
  const role = String(formData.get("role"));
  if (!(role in ROLE_LABELS)) return;
  (await cookies()).set("pilotis_role", role, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

async function requireRole(allowed: Role[]) {
  const role = await currentRole();
  if (role !== "SYSTEM_ADMIN" && !allowed.includes(role)) throw new Error(`Bu işlem için yetkiniz yok (${ROLE_LABELS[role]})`);
  return role;
}

// ───────── Gemi ─────────
const vesselSchema = z.object({
  name: z.string().trim().min(2, "Gemi adı gerekli"),
  imo: z.string().trim().regex(/^\d{7}$/, "IMO 7 haneli olmalı").optional().or(z.literal("")),
  flag: z.string().trim().max(3).optional(),
  vesselType: z.string().trim().optional(),
  gt: z.string().trim().optional(),
  dwt: z.string().trim().optional(),
  loa: z.string().trim().optional(),
});
const num = (v?: string) => (v && v.trim() !== "" ? v.replace(",", ".") : null); // boş = bilinmiyor (null), asla 0

export async function createVessel(_: unknown, formData: FormData) {
  await requireRole(["OPERATIONS_MANAGER", "PLANNER", "SHORE_OPS", "CUSTOMER"]);
  const parsed = vesselSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join(" · ") };
  const d = parsed.data;
  try {
    const [v] = await db.insert(s.vessels).values({
      name: d.name.toUpperCase(), imo: d.imo || null, flag: d.flag || null, vesselType: d.vesselType || null,
      gt: num(d.gt), dwt: num(d.dwt), loa: num(d.loa),
    }).returning();
    await recordAudit("vessel", v.id, "CREATE", v);
  } catch (e) {
    return { ok: false, message: String((e as Error).message).includes("unique") ? "Bu IMO numarası zaten kayıtlı" : "Kayıt başarısız" };
  }
  revalidatePath("/gemiler");
  return { ok: true, message: "Gemi sunucuya kaydedildi" };
}

// ───────── Operasyon ─────────
const opSchema = z.object({
  vesselId: z.string().min(1, "Gemi seçin"),
  typeCode: z.string().min(1, "Operasyon türü seçin"),
  fromFacilityId: z.string().optional(),
  toFacilityId: z.string().optional(),
  requesterPartyId: z.string().min(1, "Talep eden taraf seçin"),
  billingPartyId: z.string().optional(),
  plannedStart: z.string().min(1, "Planlanan zaman gerekli"),
  declaredGt: z.string().optional(),
  engineOk: z.string().optional(),
  idempotencyKey: z.string().min(8),
});

export async function createOperation(_: unknown, formData: FormData) {
  await requireRole(["OPERATIONS_MANAGER", "PLANNER", "SHORE_OPS", "CUSTOMER"]);
  const parsed = opSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join(" · ") };
  const d = parsed.data;

  // Çift tıklama / tekrar gönderim: aynı anahtar ⇒ aynı kayıt
  const prior = await db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "CREATE"), eq(s.auditLog.reason, `idem:${d.idempotencyKey}`)));
  if (prior.length) redirect(`/operasyonlar/${prior[0].entityId}`);

  const [type] = await db.select().from(s.operationTypes).where(eq(s.operationTypes.code, d.typeCode));
  const [lastCall] = await db.select().from(s.portCalls).where(eq(s.portCalls.vesselId, d.vesselId)).orderBy(desc(s.portCalls.createdAt)).limit(1);
  let portCallId = lastCall?.id;
  if (!portCallId) {
    const r = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM port_calls`);
    const [pc] = await db.insert(s.portCalls).values({ ref: `PC-${new Date().getUTCFullYear()}-${String(r.rows[0].n + 1).padStart(6, "0")}`, vesselId: d.vesselId }).returning();
    portCallId = pc.id;
  }
  const ref = await nextOperationRef();
  const billing = d.billingPartyId || null;
  const [op] = await db.insert(s.operations).values({
    ref, portCallId, typeCode: d.typeCode, fromFacilityId: d.fromFacilityId || null, toFacilityId: d.toFacilityId || null,
    plannedStart: new Date(/[+Z]/.test(d.plannedStart.slice(10)) ? d.plannedStart : `${d.plannedStart}:00+03:00`), requestedAt: new Date(), requesterPartyId: d.requesterPartyId, billingPartyId: billing,
    requestStatus: "SUBMITTED", approvalStatus: billing ? "AWAITING_BILLING_PARTY" : "AWAITING_BILLING_PARTY",
  }).returning();
  await db.insert(s.serviceRequests).values({
    operationId: op.id, version: 1, layer: "CUSTOMER_DECLARED",
    payload: { gt: d.declaredGt ? Number(d.declaredGt.replace(",", ".")) : null, engine: d.engineOk === "on" ? "çalışıyor" : "beyan edilmedi" },
  });
  if (billing) await db.insert(s.billingApprovals).values({ operationId: op.id, billingPartyId: billing });
  await db.insert(s.serviceLines).values(type.serviceKinds.map((k) => ({ operationId: op.id, kind: k })));
  await recordAudit("operation", ref, "CREATE", op, undefined, `idem:${d.idempotencyKey}`);
  redirect(`/operasyonlar/${ref}`);
}

// ───────── Saha olayları ─────────
const EVENT_TO_STATUS: Record<string, { to: string; ctx?: string }> = {
  TRANSIT_START: { to: "TRANSIT" }, ARRIVED_SITE: { to: "ON_SITE" },
  PILOT_BOARDED: { to: "STARTED" }, TUG_ALONGSIDE: { to: "STARTED" }, MOORING_START: { to: "STARTED" },
  PAUSE_START: { to: "PAUSED" }, PAUSE_END: { to: "STARTED" },
};

async function recordEventImpl(formData: FormData) {
  const role = await requireRole(["SHORE_OPS", "PILOT", "TUG_MASTER", "OPERATIONS_MANAGER"]);
  const ref = String(formData.get("ref"));
  const type = String(formData.get("type"));
  const assetId = (formData.get("assetId") as string) || null;
  const note = (formData.get("note") as string) || null;
  const clientEventId = String(formData.get("clientEventId") || "") || null;
  const o = await loadOperation(ref);
  if (!o) throw new Error("Operasyon bulunamadı");

  const transition = EVENT_TO_STATUS[type];
  const current = o.op.opStatus;
  if (transition && current !== transition.to) {
    const declarationChecked = o.events.some((e) => e.type === "DECLARATION_CHECKED");
    const res = canTransition(OP_STATUS_TRANSITIONS, current, transition.to, [role], { declarationChecked, pauseReason: note });
    if (!res.ok) throw new Error(res.reason);
  }
  const serviceKind = type === "PILOT_BOARDED" || type === "PILOT_DISEMBARKED" ? "PILOTAGE" : type === "TUG_ALONGSIDE" ? "TOWAGE" : type === "MOORING_START" ? "MOORING" : ((formData.get("serviceKind") as string) || null);
  try {
    await db.insert(s.timelineEvents).values({
      operationId: o.op.id, type: type as "SERVICE_START", occurredAt: new Date(), deviceAt: new Date(),
      assetId, note, clientEventId, serviceKind: serviceKind as "TOWAGE" | null,
    });
  } catch (e) {
    if (String((e as Error).message).includes("client_event_id")) return; // tekrar gönderim — çoğaltma yok
    throw e;
  }
  if (transition && current !== transition.to) {
    await db.update(s.operations).set({ opStatus: transition.to as "STARTED", version: o.op.version + 1, updatedAt: new Date() }).where(eq(s.operations.id, o.op.id));
  }
  await recordAudit("operation", ref, `EVENT:${type}`, { assetId, note });
  revalidatePath(`/operasyonlar/${ref}`);
}

async function closeOperationImpl(formData: FormData) {
  const role = await requireRole(["SHORE_OPS", "OPERATIONS_MANAGER", "TUG_MASTER", "PILOT"]);
  const ref = String(formData.get("ref"));
  const outcome = String(formData.get("outcome")); // COMPLETED | PARTIAL | CANCELLED
  const reason = (formData.get("reason") as string) || null;
  const o = await loadOperation(ref);
  if (!o) throw new Error("Operasyon bulunamadı");
  const res = canTransition(OP_STATUS_TRANSITIONS, o.op.opStatus, outcome, [role], { incompleteReason: reason, cancelReason: reason });
  if (!res.ok) throw new Error(res.reason);
  if (outcome !== "COMPLETED") {
    await db.insert(s.timelineEvents).values({ operationId: o.op.id, type: "CANCEL_OR_INCOMPLETE", occurredAt: new Date(), reasonCode: reason });
    await db.update(s.serviceLines).set({ status: outcome as "PARTIAL", cancelReason: reason }).where(eq(s.serviceLines.operationId, o.op.id));
  } else {
    await db.update(s.serviceLines).set({ status: "COMPLETED" }).where(eq(s.serviceLines.operationId, o.op.id));
  }
  // Operasyonun kapanması tahakkuk/fatura/bildirimi tamamlamaz
  await db.update(s.operations).set({ opStatus: outcome as "COMPLETED", version: o.op.version + 1, updatedAt: new Date() }).where(eq(s.operations.id, o.op.id));
  await recordAudit("operation", ref, `CLOSE:${outcome}`, { reason });
  revalidatePath(`/operasyonlar/${ref}`);
}

// ───────── Saha doğrulaması (yeni sürüm, eskisi korunur) ─────────
async function verifyDeclarationImpl(formData: FormData) {
  await requireRole(["SHORE_OPS", "OPERATIONS_MANAGER"]);
  const ref = String(formData.get("ref"));
  const gtRaw = String(formData.get("gt") || "").replace(",", ".");
  const engine = String(formData.get("engine") || "");
  const note = String(formData.get("note") || "");
  const o = await loadOperation(ref);
  if (!o) throw new Error("Operasyon bulunamadı");
  const nextVersion = (o.requests.at(-1)?.version ?? 0) + 1;
  await db.insert(s.serviceRequests).values({
    operationId: o.op.id, version: nextVersion, layer: "FIELD_VERIFIED",
    payload: { gt: gtRaw ? Number(gtRaw) : null, engine, note }, reason: note || "Saha doğrulaması",
  });
  if (!o.events.some((e) => e.type === "DECLARATION_CHECKED")) {
    await db.insert(s.timelineEvents).values({ operationId: o.op.id, type: "DECLARATION_CHECKED", occurredAt: new Date(), note });
  }
  await recordAudit("operation", ref, "FIELD_VERIFIED", { gt: gtRaw, engine, note });
  revalidatePath(`/operasyonlar/${ref}`);
}

// ───────── Fatura muhatabı ─────────
async function setBillingPartyImpl(formData: FormData) {
  await requireRole(["OPERATIONS_MANAGER", "ACCOUNTING", "PLANNER"]);
  const ref = String(formData.get("ref"));
  const billingPartyId = String(formData.get("billingPartyId"));
  const o = await loadOperation(ref);
  if (!o || !billingPartyId) throw new Error("Eksik bilgi");
  await db.update(s.operations).set({ billingPartyId, approvalStatus: "AWAITING_BILLING_PARTY" }).where(eq(s.operations.id, o.op.id));
  await db.insert(s.billingApprovals).values({ operationId: o.op.id, billingPartyId })
    .onConflictDoUpdate({ target: s.billingApprovals.operationId, set: { billingPartyId, decision: "PENDING", decidedAt: null } });
  await recordAudit("operation", ref, "SET_BILLING_PARTY", { billingPartyId });
  revalidatePath(`/operasyonlar/${ref}`);
}

async function decideBillingImpl(formData: FormData) {
  await requireRole(["BILLING_PARTY", "OPERATIONS_MANAGER"]);
  const ref = String(formData.get("ref"));
  const decision = String(formData.get("decision")) as "APPROVED" | "REJECTED";
  const person = String(formData.get("authorizedPerson") || "").trim();
  const taxVerified = formData.get("taxVerified") === "on";
  if (decision === "APPROVED" && (!person || !taxVerified)) throw new Error("Onay için yetkili kişi ve vergi doğrulaması gerekli");
  const o = await loadOperation(ref);
  if (!o) throw new Error("Operasyon bulunamadı");
  await db.update(s.billingApprovals).set({ decision, authorizedPerson: person || null, taxVerified, decidedAt: new Date(), approvedDocVersionId: `TALEPNAME_V${o.requests.at(-1)?.version ?? 1}` })
    .where(eq(s.billingApprovals.operationId, o.op.id));
  await db.update(s.operations).set({ approvalStatus: decision === "APPROVED" ? "OPS_REVIEW" : "AWAITING_BILLING_PARTY" }).where(eq(s.operations.id, o.op.id));
  await recordAudit("operation", ref, `BILLING_${decision}`, { person, taxVerified });
  revalidatePath(`/operasyonlar/${ref}`);
}

// ───────── Hesap kaydı ─────────
async function saveCalculationImpl(formData: FormData) {
  await requireRole(["ACCOUNTING", "OPERATIONS_MANAGER", "TARIFF_OFFICER"]);
  const ref = String(formData.get("ref"));
  const o = await loadOperation(ref);
  if (!o) throw new Error("Operasyon bulunamadı");
  const { results, error } = await computeOperation(o);
  if (error) throw new Error(error);
  for (const r of results) {
    await db.insert(s.calculationResults).values({
      operationId: o.op.id, kind: o.op.opStatus === "COMPLETED" || o.op.opStatus === "PARTIAL" ? "FINAL" : "ESTIMATE",
      tariffVersionId: r.tariffVersionId, inputHash: r.inputHash, inputs: r.verifiedInputs, breakdown: r as unknown as object,
      netAmount: r.netAmount, currency: r.currency, productionEligible: r.productionEligible,
    });
  }
  if (o.op.accrualStatus === "AWAITING_CALC") await db.update(s.operations).set({ accrualStatus: "IN_REVIEW" }).where(eq(s.operations.id, o.op.id));
  await recordAudit("operation", ref, "CALCULATION_SAVED", { count: results.length, hash: createHash("sha256").update(JSON.stringify(results)).digest("hex").slice(0, 16) });
  revalidatePath(`/operasyonlar/${ref}`);
}

// ───────── Durum döndüren sarmalayıcılar (sunucudan başarı gelmeden 'kaydedildi' denmez) ─────────
export type ActionState = { ok: boolean; message: string; at?: string } | null;
async function run(fn: () => Promise<unknown>, okMsg: string): Promise<ActionState> {
  try { await fn(); return { ok: true, message: okMsg, at: new Date().toISOString() }; }
  catch (e) { return { ok: false, message: (e as Error).message || "İşlem başarısız" }; }
}
export async function recordEvent(_: ActionState, formData: FormData): Promise<ActionState> { return run(() => recordEventImpl(formData), "Olay sunucuya kaydedildi"); }
export async function closeOperation(_: ActionState, formData: FormData): Promise<ActionState> { return run(() => closeOperationImpl(formData), "Operasyon durumu güncellendi"); }
export async function verifyDeclaration(_: ActionState, formData: FormData): Promise<ActionState> { return run(() => verifyDeclarationImpl(formData), "Saha doğrulaması yeni sürüm olarak kaydedildi"); }
export async function setBillingParty(_: ActionState, formData: FormData): Promise<ActionState> { return run(() => setBillingPartyImpl(formData), "Fatura muhatabı atandı; onayı bekleniyor"); }
export async function decideBilling(_: ActionState, formData: FormData): Promise<ActionState> { return run(() => decideBillingImpl(formData), "Karar kaydedildi"); }
export async function saveCalculation(_: ActionState, formData: FormData): Promise<ActionState> { return run(() => saveCalculationImpl(formData), "Hesap kaydı oluşturuldu"); }

// ───────── Hesap simülatörü (kayıt oluşturmaz) ─────────
export type SimState = { ok: boolean; message?: string; result?: CalcResult } | null;
export async function simulateCalc(_: SimState, f: FormData): Promise<SimState> {
  try {
    const gtRaw = String(f.get("gt") || "").replace(",", ".");
    const minRaw = String(f.get("minutes") || "");
    const date = String(f.get("date") || "");
    const input: CalcInput = {
      operationRef: "SIMULASYON", serviceKind: String(f.get("serviceKind")) as CalcInput["serviceKind"],
      serviceDate: new Date(`${date}T12:00:00+03:00`).toISOString(), gt: gtRaw ? Number(gtRaw) : null,
      measuredMinutes: minRaw ? Number(minRaw) : null, allocatedUnits: Number(f.get("allocated") || 1), requestedUnits: Number(f.get("requested") || 1),
      extraUnitsWrittenRequest: f.get("written") === "on", conditionCodes: f.getAll("cond").map(String),
      completion: String(f.get("completion")) as CalcInput["completion"], waitingMinutes: Number(f.get("waiting") || 0),
    };
    const v = pickVersion(await loadTariffs(), input.serviceDate);
    return { ok: true, result: calcEngine(input, v, await ruleStatusMap()) };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
