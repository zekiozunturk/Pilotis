import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage } from "@/lib/session";
import { errorWorkbook } from "@/lib/exchange/engine";
import { xlsxResponse } from "@/lib/excel";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireInternalPage();
  const { id } = await params;
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, id));
  if (!b) return new Response("Yok", { status: 404 });
  return xlsxResponse(await errorWorkbook(id), `${b.no}_SONUC_RAPORU.xlsx`);
}
