import { requireInternalPage, currentRole } from "@/lib/session";
import { entityByKey } from "@/lib/exchange/registry";
import { templateWorkbook } from "@/lib/exchange/engine";
import { xlsxResponse } from "@/lib/excel";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ entity: string }> }) {
  await requireInternalPage();
  const ent = entityByKey((await params).entity);
  if (!ent || !ent.canImport(await currentRole())) return new Response("Yetki yok", { status: 403 });
  return xlsxResponse(await templateWorkbook(ent), `PILOTIS_SABLON_${ent.key.toUpperCase()}.xlsx`);
}
