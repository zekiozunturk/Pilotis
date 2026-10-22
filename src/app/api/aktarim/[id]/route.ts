import { eq, asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireInternalPage();
  const { id } = await params;
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, id));
  if (!b) return new Response("Yok", { status: 404 });
  const rows = ["DONE", "DRY_RUN", "FAILED", "REVERTED", "PARTIALLY_REVERTED"].includes(b.status) ? await db.select().from(s.importRows).where(eq(s.importRows.batchId, id)).orderBy(asc(s.importRows.rowNo)).limit(500) : [];
  return Response.json({ id: b.id, no: b.no, status: b.status, progress: b.progress, total: b.total, summary: b.summary, message: b.message, rows: rows.map((r) => ({ rowNo: r.rowNo, action: r.action, errors: r.errors, warnings: r.warnings, revertNote: r.revertNote, applied: !!r.appliedAt })) });
}
