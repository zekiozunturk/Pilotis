import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { analyticsAccess } from "@/lib/analytics/access";
import type { Role } from "@/lib/workflow";
import type { ReportDef } from "@/lib/analytics/report";
import { computeReport } from "@/app/analiz/rapor/compute";

export const dynamic = "force-dynamic";
const scopeToFilter = (scope: string, now = new Date()) => {
  const d = (x: Date) => new Date(x.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const day = 86_400_000, t = new Date(now.getTime() - day);
  if (scope === "Dün") return `bas=${d(t)}&bit=${d(t)}`;
  if (scope === "Son 7 gün") return `bas=${d(new Date(now.getTime() - 7 * day))}&bit=${d(t)}`;
  if (scope === "Geçen ay") { const n = new Date(now.getTime() + 3 * 3_600_000); const first = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)), last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0)); return `bas=${first.toISOString().slice(0, 10)}&bit=${last.toISOString().slice(0, 10)}`; }
  return `bas=${d(now).slice(0, 7)}-01&bit=${d(now)}`;
};

/** Zamanlanmış raporları çalıştırır (zamanlayıcı/cron çağırır). Her alıcı için yetki GÖNDERİM ANINDA yeniden kontrol edilir. */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return new Response("Yetkisiz", { status: 401 });
  const onlyId = req.nextUrl.searchParams.get("id");
  const list = (await db.select().from(s.reportSchedules).where(eq(s.reportSchedules.active, true))).filter((x) => !onlyId || x.id === onlyId);
  const results = [];
  for (const sc of list) {
    const [rep] = await db.select().from(s.reports).where(eq(s.reports.id, sc.reportId));
    if (!rep) continue;
    const def = rep.definition as ReportDef;
    const recips = sc.recipients as { email: string; role: Role }[];
    const lines: string[] = [];
    let produced = 0;
    for (const r of recips) {
      const acc = analyticsAccess(r.role);
      const needFinance = def.measures.some((m) => ["accrual", "invoiced", "credit", "net", "tax", "collected", "open", "disputed", "estimate", "related", "allocated", "cost"].includes(m.key));
      if (!acc.reports || (needFinance && !acc.finance)) { lines.push(`${r.email}: yetki yok — gönderilmedi`); continue; }
      try { const c = await computeReport(def, scopeToFilter(sc.dataScope), { role: r.role }); produced++; lines.push(`${r.email}: ${c.out.rows.length} satır hazırlandı`); }
      catch (e) { lines.push(`${r.email}: ${(e as Error).message}`); }
    }
    const transport = process.env.SMTP_URL ? "gönderildi" : "e-posta altyapısı yapılandırılmadı (SMTP_URL) — dosya üretildi, gönderilmedi";
    const result = `${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · ${produced}/${recips.length} alıcı · ${transport} · ${lines.join("; ")}`;
    await db.update(s.reportSchedules).set({ lastRunAt: new Date(), lastResult: result }).where(eq(s.reportSchedules.id, sc.id));
    await db.insert(s.auditLog).values({ entity: "report_schedule", entityId: sc.id, action: "RUN", after: { result }, actorId: "scheduler" });
    results.push({ id: sc.id, result });
  }
  return Response.json({ ran: results.length, results });
}
