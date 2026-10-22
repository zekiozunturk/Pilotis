import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { storage } from "@/lib/storage";
import { currentScope } from "@/lib/session";
import { canSeeOperation } from "@/lib/scope";
import { recordAudit } from "@/lib/ops";

/** Belge indirme: her istekte kayıt düzeyi yetki kontrolü; doğrudan dosya yolu yok. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc] = await db.select().from(s.documentVersions).where(eq(s.documentVersions.id, id));
  if (!doc?.storageKey) return new NextResponse("Bulunamadı", { status: 404 });
  const [op] = await db.select().from(s.operations).where(eq(s.operations.id, doc.operationId));
  const [pc] = await db.select().from(s.portCalls).where(eq(s.portCalls.id, op.portCallId));
  const scope = await currentScope();
  if (!canSeeOperation(scope, { ...op, agentPartyId: pc.agentPartyId })) return new NextResponse("Bulunamadı", { status: 404 });
  const body = await storage.get(doc.storageKey);
  await recordAudit("document", doc.id, "DOWNLOAD", { role: scope.role, party: scope.partyId });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `inline; filename="${doc.fileName}"`,
      "X-Content-SHA256": doc.sha256 ?? "",
      "Cache-Control": "private, no-store",
    },
  });
}
