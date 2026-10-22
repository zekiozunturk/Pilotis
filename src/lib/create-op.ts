import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { nextOperationRef, recordAudit } from "./ops";
import type { Declaration } from "./declaration";

export interface NewOp {
  vesselId: string; typeCode: string; fromFacilityId?: string | null; toFacilityId?: string | null;
  plannedStart: Date; requesterPartyId: string; billingPartyId?: string | null; declaration: Declaration; actor?: string; source: string;
}

/** Talepten operasyon kaydı: v1 müşteri beyanı + hizmet satırları + (varsa) muhatap onay kaydı */
export async function createOperationRecord(n: NewOp): Promise<{ id: string; ref: string }> {
  return db.transaction(async (tx) => {
    const [type] = await tx.select().from(s.operationTypes).where(eq(s.operationTypes.code, n.typeCode));
    if (!type) throw new Error("Operasyon türü bulunamadı");
    const [lastCall] = await tx.select().from(s.portCalls).where(eq(s.portCalls.vesselId, n.vesselId)).orderBy(desc(s.portCalls.createdAt)).limit(1);
    let portCallId = lastCall?.id;
    if (!portCallId) {
      const r = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM port_calls`);
      const [pc] = await tx.insert(s.portCalls).values({
        ref: `PC-${new Date().getUTCFullYear()}-${String(r.rows[0].n + 1).padStart(6, "0")}`, vesselId: n.vesselId,
        cargoCondition: (n.declaration.cargoCondition as "LADEN") ?? "UNKNOWN", dgClass: n.declaration.dgClass ?? null, unNumber: n.declaration.unNumber ?? null,
      }).returning();
      portCallId = pc.id;
    }
    const ref = await nextOperationRef();
    const [op] = await tx.insert(s.operations).values({
      ref, portCallId, typeCode: n.typeCode, fromFacilityId: n.fromFacilityId || null, toFacilityId: n.toFacilityId || null,
      plannedStart: n.plannedStart, requestedAt: new Date(), requesterPartyId: n.requesterPartyId, billingPartyId: n.billingPartyId || null,
      requestStatus: "SUBMITTED", approvalStatus: "AWAITING_BILLING_PARTY",
    }).returning();
    await tx.insert(s.serviceRequests).values({ operationId: op.id, version: 1, layer: "CUSTOMER_DECLARED", payload: n.declaration });
    if (n.billingPartyId) await tx.insert(s.billingApprovals).values({ operationId: op.id, billingPartyId: n.billingPartyId });
    if (type.serviceKinds.length) await tx.insert(s.serviceLines).values(type.serviceKinds.map((k) => ({ operationId: op.id, kind: k })));
    await tx.insert(s.auditLog).values({ entity: "operation", entityId: ref, action: "CREATE", after: { source: n.source, typeCode: n.typeCode } as object, actorId: n.actor });
    return { id: op.id, ref };
  });
}

export function istanbulDate(local: string): Date {
  // datetime-local "2026-10-24T09:30" → Europe/Istanbul (UTC+3, yaz saati uygulanmıyor)
  return new Date(/[+Z]/.test(local.slice(10)) ? local : `${local.length === 16 ? `${local}:00` : local}+03:00`);
}

export { recordAudit };
