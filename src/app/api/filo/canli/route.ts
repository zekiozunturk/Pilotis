import { currentScope } from "@/lib/session";
import { getLiveFleet } from "@/lib/live-fleet";
export const dynamic = "force-dynamic";
/** Canlı filo: araç konumu, kaptan, görev — yalnız işletme personeli */
export async function GET() {
  const scope = await currentScope();
  if (scope.external) return new Response("Bulunamadı", { status: 404 });
  return Response.json(await getLiveFleet(), { headers: { "cache-control": "no-store" } });
}
