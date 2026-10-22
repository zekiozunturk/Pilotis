import { NextResponse } from "next/server";
import { fetchTcmb } from "@/lib/fx";
import { recordAudit } from "@/lib/ops";

/** Zamanlanmış görev uç noktası: her iş günü 15:45 sonrası çağrılır. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new NextResponse("Yetkisiz", { status: 401 });
  try {
    const r = await fetchTcmb(undefined, "cron");
    await recordAudit("exchange_rates", r.bulletinDate, "TCMB_FETCH", r, "cron");
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
