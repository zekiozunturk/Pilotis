"use server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { currentRole, currentScope, ROLE_LABELS } from "@/lib/session";
import { declarationImpact, type Declaration } from "@/lib/declaration";
import { generateDocument } from "@/lib/docs/service";
import { DOC_TYPES, type DocType } from "@/lib/docs/builders";
import { storage } from "@/lib/storage";
import { canTransition, OP_STATUS_TRANSITIONS, type Role } from "@/lib/workflow";
import { computeOperation, loadOperation, nextOperationRef, recordAudit } from "@/lib/ops";
import { createHash } from "node:crypto";
import { calculate as calcEngine, selectTariffVersion as pickVersion } from "@/lib/tariff/engine";
import { loadTariffs, ruleStatusMap } from "@/lib/ops";
import { getFxTable } from "@/lib/fx";
import type { CalcResult, CalcInput } from "@/lib/tariff/types";

export async function setDisplayCurrency(formData: FormData) {
  const c = String(formData.get("ccy"));
  if (!["TRY", "USD", "EUR"].includes(c)) return;
  (await cookies()).set("pilotis_ccy", c, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function setRole(formData: FormData) {
  const role = String(formData.get("role"));
  if (!(role in ROLE_LABELS)) return;
  const c = await cookies();
  c.set("pilotis_role", role, { httpOnly: true, sameSite: "lax", path: "/" });
  const party = String(formData.get("party") || "");
  if (party) c.set("pilotis_party", party, { httpOnly: true, sameSite: "lax", path: "/" }); else c.delete("pilotis_party");
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
  const o = await loadOperation(ref);
  if (!o) throw new Error("Operasyon bulunamadı");
  const str = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v === "" ? null : v; };
  const gtRaw = str("gt");
  const next: Declaration = {
    gt: gtRaw ? Number(gtRaw.replace(",", ".")) : null, engine: str("engine"), rudder: str("rudder"),
    cargoCondition: str("cargoCondition"), dgClass: str("dgClass"), unNumber: str("unNumber"),
    gasFreeCert: formData.get("gasFreeCert") === "on" ? true : null, note: str("note"),
  };
  const prev = o.requests.at(-1)?.payload as Declaration | undefined;
  const impact = declarationImpact(prev, next);
  const nextVersion = (o.requests.at(-1)?.version ?? 0) + 1;
  await db.insert(s.serviceRequests).values({
    operationId: o.op.id, version: nextVersion, layer: "FIELD_VERIFIED",
    payload: { ...prev, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== null)) }, reason: next.note || "Saha doğrulaması",
  });
  if (!o.events.some((e) => e.type === "DECLARATION_CHECKED")) {
    await db.insert(s.timelineEvents).values({ operationId: o.op.id, type: "DECLARATION_CHECKED", occurredAt: new Date(), note: next.note });
  }
  let reapproval = false;
  if (impact.requiresReapproval && o.billing?.decision === "APPROVED") {
    await db.update(s.billingApprovals).set({ decision: "PENDING", decidedAt: null, note: `Beyan değişti (v${nextVersion}): ${impact.changes.map((c) => c.label).join(", ")}` }).where(eq(s.billingApprovals.operationId, o.op.id));
    await db.update(s.operations).set({ approvalStatus: "AWAITING_BILLING_PARTY" }).where(eq(s.operations.id, o.op.id));
    reapproval = true;
  }
  await recordAudit("operation", ref, "FIELD_VERIFIED", { version: nextVersion, impact });
  revalidatePath(`/operasyonlar/${ref}`);
  if (!impact.changes.length) return `v${nextVersion} kaydedildi — beyanla uyumlu, değişiklik yok`;
  return `v${nextVersion} kaydedildi — değişen: ${impact.changes.map((c) => `${c.label} ${c.from ?? "—"}→${c.to}`).join(", ")}. Etkilenen: ${impact.affected.join(", ")}.${reapproval ? " Fatura muhatabından YENİDEN ONAY istendi." : ""}`;
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
  const role = await requireRole(["BILLING_PARTY", "OPERATIONS_MANAGER"]);
  const ref = String(formData.get("ref"));
  const decision = String(formData.get("decision")) as "APPROVED" | "REJECTED";
  const person = String(formData.get("authorizedPerson") || "").trim();
  const taxVerified = formData.get("taxVerified") === "on";
  const signature = String(formData.get("signature") || "");
  if (decision === "APPROVED" && (!person || !taxVerified)) throw new Error("Onay için yetkili kişi ve vergi doğrulaması gerekli");
  const o = await loadOperation(ref);
  if (!o || !o.billing) throw new Error("Önce fatura muhatabı atanmalı");
  const scope = await currentScope();
  if (scope.external && scope.partyId !== o.billing.billingPartyId) throw new Error("Yalnız atanmış fatura muhatabı karar verebilir");
  // Onay, içeriği sabitlenmiş talepname sürümüne verilir
  const doc = await generateDocument(ref, "TALEPNAME", role);
  let sigKey: string | null = null;
  if (signature.startsWith("data:image/png;base64,")) {
    const png = Buffer.from(signature.slice(22), "base64");
    if (png.byteLength > 400_000) throw new Error("İmza görüntüsü çok büyük");
    sigKey = (await storage.put(`${ref}/imza/${doc.fileName.replace(".pdf", "")}_${Date.now()}.png`, png)).key;
  }
  await db.insert(s.documentApprovals).values({
    documentVersionId: doc.id, partyId: o.billing.billingPartyId, approverName: person || "—", level: sigKey ? "DRAWN" : "OTP_ACCOUNT",
    decision, signatureImageKey: sigKey, userAgent: (await headers()).get("user-agent")?.slice(0, 200) ?? null,
  });
  await db.update(s.billingApprovals).set({ decision, authorizedPerson: person || null, taxVerified, decidedAt: new Date(), approvedDocVersionId: doc.id, note: null })
    .where(eq(s.billingApprovals.operationId, o.op.id));
  await db.update(s.operations).set({ approvalStatus: decision === "APPROVED" ? "OPS_REVIEW" : "AWAITING_BILLING_PARTY" }).where(eq(s.operations.id, o.op.id));
  await recordAudit("operation", ref, `BILLING_${decision}`, { person, taxVerified, doc: doc.fileName, level: sigKey ? "DRAWN" : "OTP_ACCOUNT" });
  revalidatePath(`/operasyonlar/${ref}`);
  return decision === "APPROVED" ? `Onay ${doc.fileName} sürümüne bağlandı` : "Ret kaydedildi";
}

// ───────── Belgeler ─────────
async function generateDocImpl(formData: FormData) {
  const role = await requireRole(["OPERATIONS_MANAGER", "SHORE_OPS", "PLANNER", "ACCOUNTING"]);
  const ref = String(formData.get("ref"));
  const type = String(formData.get("docType")) as DocType;
  if (!(type in DOC_TYPES)) throw new Error("Bilinmeyen belge türü");
  const r = await generateDocument(ref, type, role);
  revalidatePath(`/operasyonlar/${ref}`);
  if (!r.created) return `İçerik değişmedi — mevcut ${r.fileName} geçerli`;
  return `${r.fileName} oluşturuldu${r.invalidatedApproval ? " · içerik değiştiği için fatura muhatabı onayı yenilenmeli" : ""}`;
}

async function uploadWetSignedImpl(formData: FormData) {
  const role = await requireRole(["OPERATIONS_MANAGER", "SHORE_OPS", "ACCOUNTING"]);
  const ref = String(formData.get("ref"));
  const baseId = String(formData.get("documentVersionId"));
  const signer = String(formData.get("signer") || "").trim();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Dosya seçin");
  if (!signer) throw new Error("İmzalayan kişi gerekli");
  if (file.size > 15_000_000) throw new Error("Dosya 15 MB'tan büyük olamaz");
  const buf = new Uint8Array(await file.arrayBuffer());
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (!isPdf && !isJpg && !isPng) throw new Error("Yalnız PDF, JPG veya PNG kabul edilir (içerik imzası kontrol edildi)");
  const [base] = await db.select().from(s.documentVersions).where(eq(s.documentVersions.id, baseId));
  if (!base) throw new Error("Belge bulunamadı");
  const [maxV] = await db.select({ v: s.documentVersions.version }).from(s.documentVersions)
    .where(and(eq(s.documentVersions.operationId, base.operationId), eq(s.documentVersions.docType, base.docType))).orderBy(desc(s.documentVersions.version)).limit(1);
  const version = (maxV?.v ?? 0) + 1;
  const ext = isPdf ? "pdf" : isJpg ? "jpg" : "png";
  const fileName = base.fileName.replace(/_V\d+\.pdf$/, `_V${String(version).padStart(2, "0")}_ISLAK_IMZA.${ext}`);
  const stored = await storage.put(`${ref}/${fileName}`, buf);
  const [row] = await db.insert(s.documentVersions).values({
    operationId: base.operationId, docType: base.docType, version, fileName, storageKey: stored.key, sizeBytes: stored.size, sha256: stored.sha256,
    sourceSnapshotHash: base.sourceSnapshotHash, origin: "UPLOADED_WET_SIGNED", contentType: isPdf ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : "png"}`,
    generatedBy: role, signature: "WET_UPLOADED", signedBy: signer, signedAt: new Date(),
  }).returning();
  await recordAudit("document", row.id, "UPLOAD_WET_SIGNED", { base: base.fileName, sha256: stored.sha256, signer });
  revalidatePath(`/operasyonlar/${ref}`);
  return `${fileName} yüklendi (V${version} · ${base.fileName} içeriğine dayanır)`;
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
  try { const r = await fn(); return { ok: true, message: typeof r === "string" ? r : okMsg, at: new Date().toISOString() }; }
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
      tariffCategory: String(f.get("category") || "") || null, bollardPullT: String(f.get("bollard") || "") ? Number(String(f.get("bollard")).replace(",", ".")) : null,
    };
    const all = await loadTariffs();
    const chosen = String(f.get("versionId") || "");
    const v = chosen ? all.find((x) => x.id === chosen) : pickVersion(all, input.serviceDate);
    if (!v) return { ok: false, message: "Tarife sürümü bulunamadı" };
    const from = new Date(v.validFrom).getTime(), to = new Date(v.validTo).getTime(), d = new Date(input.serviceDate).getTime();
    if (d < from || d > to) return { ok: false, message: `Hizmet tarihi seçilen sürümün geçerlilik dönemi dışında (${v.validFrom.slice(0, 10)} – ${v.validTo.slice(0, 10)})` };
    input.fx = await getFxTable(input.serviceDate);
    return { ok: true, result: calcEngine(input, v, await ruleStatusMap()) };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
export async function generateDoc(_: ActionState, f: FormData): Promise<ActionState> { return run(() => generateDocImpl(f), "Belge oluşturuldu"); }
export async function uploadWetSigned(_: ActionState, f: FormData): Promise<ActionState> { return run(() => uploadWetSignedImpl(f), "Yüklendi"); }
