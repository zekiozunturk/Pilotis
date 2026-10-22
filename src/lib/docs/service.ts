import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { computeOperation, loadOperation, recordAudit, type LoadedOperation } from "../ops";
import { actualDuration, type ServiceKindT } from "../durations";
import { EVENT_LABELS } from "../labels";
import { OPERATOR, BRAND } from "@/data/catalog";
import { storage } from "../storage";
import { buildSpec, APPROVAL_BOUND, DOC_TYPES, type DocType, type DocInput } from "./builders";
import { renderPdf } from "./render";
import { docFileName } from "./naming";
import type { Declaration } from "../declaration";

const fmt = (d: Date | null | undefined) => d ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }).format(d) : null;

export async function toDocInput(o: LoadedOperation): Promise<DocInput> {
  const { results } = await computeOperation(o);
  const { results: estimates } = await computeOperation(o, "estimate");
  const evs = o.events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() }));
  return {
    opRef: o.op.ref, portCallRef: o.portCall.ref, isDemo: o.op.isDemo, typeCode: o.type.code, typeName: o.type.nameTr,
    plannedStart: fmt(o.op.plannedStart), from: o.from?.name ?? null, to: o.to?.name ?? null,
    vessel: { name: o.vessel.name, imo: o.vessel.imo, flag: o.vessel.flag, type: o.vessel.vesselType, gt: o.vessel.gt, nt: o.vessel.nt, dwt: o.vessel.dwt, loa: o.vessel.loa },
    requester: o.requester?.legalName ?? null, agent: o.agent?.legalName ?? null,
    billing: o.billingParty ? { name: o.billingParty.legalName, taxNumber: o.billingParty.taxNumber, taxOffice: o.billingParty.taxOffice, address: o.billingParty.address } : null,
    billingDecision: o.billing?.decision ?? null,
    declarations: o.requests.map((r) => ({ version: r.version, layer: r.layer, payload: r.payload as Declaration, createdAt: r.createdAt.toISOString() })),
    lines: o.lines.map((l) => ({ kind: l.kind, allocated: l.allocatedUnits, billable: l.billableUnits, status: l.status, cancelReason: l.cancelReason })),
    durations: o.lines.filter((l) => ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"].includes(l.kind)).map((l) => {
      const d = actualDuration(evs, l.kind as ServiceKindT);
      return { kind: l.kind, start: fmt(d.start ? new Date(d.start) : null), end: fmt(d.end ? new Date(d.end) : null), minutes: d.grossMinutes, pause: d.pauseMinutes };
    }),
    events: o.events.map((e) => ({ at: fmt(e.occurredAt)!, label: EVENT_LABELS[e.type], asset: o.assets.find((a) => a.id === e.assetId)?.name ?? null, note: e.note ?? e.reasonCode })),
    calcs: results,
    estimates,
    statuses: { op: o.op.opStatus },
  };
}

export function specHash(spec: unknown): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

export interface GenResult { id: string; version: number; fileName: string; created: boolean; invalidatedApproval: boolean }

/**
 * Belgeyi üretir. İçerik değişmediyse yeni sürüm açmaz (aynı veri ⇒ aynı belge).
 * Onaya bağlı belge (talepname/taahhütname) yeni sürüme geçerse önceki fatura muhatabı onayı düşer.
 */
export async function generateDocument(ref: string, type: DocType, actor: string): Promise<GenResult> {
  const o = await loadOperation(ref);
  if (!o) throw new Error("Operasyon bulunamadı");
  const input = await toDocInput(o);
  // onay durumu belgeyi değiştirmesin diye hash'te muhatap kararı dışarıda tutulur
  const spec = buildSpec(type, { ...input, billingDecision: APPROVAL_BOUND.includes(type) ? null : input.billingDecision });
  const hash = specHash(spec);
  const [last] = await db.select().from(s.documentVersions)
    .where(and(eq(s.documentVersions.operationId, o.op.id), eq(s.documentVersions.docType, type), eq(s.documentVersions.origin, "GENERATED")))
    .orderBy(desc(s.documentVersions.version)).limit(1);
  if (last && last.sourceSnapshotHash === hash) return { id: last.id, version: last.version, fileName: last.fileName, created: false, invalidatedApproval: false };

  const [maxV] = await db.select({ v: s.documentVersions.version }).from(s.documentVersions)
    .where(and(eq(s.documentVersions.operationId, o.op.id), eq(s.documentVersions.docType, type))).orderBy(desc(s.documentVersions.version)).limit(1);
  const version = (maxV?.v ?? 0) + 1;
  const now = new Date();
  const fileName = docFileName(type, o.vessel.name, now, o.op.ref, version);
  const docNo = `${type}-${o.op.ref}-V${String(version).padStart(2, "0")}`;
  spec.meta = [["Belge No", docNo], ["Operasyon", o.op.ref], ["Belge türü", DOC_TYPES[type]], ["Sürüm", `V${String(version).padStart(2, "0")}`], ["Gemi", o.vessel.name], ["Veri Özeti", hash.slice(0, 16)]];
  const bytes = await renderPdf(spec, { operator: { name: OPERATOR.legalName, address: OPERATOR.address, phone: OPERATOR.phone, email: OPERATOR.email }, brand: { slogan: BRAND.slogan }, docNo, snapshotHash: hash, generatedAt: fmt(now)! });
  const key = `${o.op.ref}/${fileName}`;
  const stored = await storage.put(key, bytes);
  const [row] = await db.insert(s.documentVersions).values({
    operationId: o.op.id, docType: type, version, fileName, storageKey: key, sizeBytes: stored.size, sha256: stored.sha256, sourceSnapshotHash: hash, generatedBy: actor,
  }).returning();

  let invalidated = false;
  if (APPROVAL_BOUND.includes(type) && o.billing && o.billing.decision === "APPROVED" && last) {
    // içerik değişti → önceki onay bu sürümü kapsamaz
    await db.update(s.billingApprovals).set({ decision: "PENDING", decidedAt: null, note: `${docNo} yeni sürüm: yeniden onay gerekli` }).where(eq(s.billingApprovals.operationId, o.op.id));
    await db.update(s.operations).set({ approvalStatus: "AWAITING_BILLING_PARTY" }).where(eq(s.operations.id, o.op.id));
    invalidated = true;
  }
  await recordAudit("document", row.id, "GENERATE", { type, version, sha256: stored.sha256, snapshot: hash, invalidated }, actor);
  return { id: row.id, version, fileName, created: true, invalidatedApproval: invalidated };
}
