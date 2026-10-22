import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { analyticsAccess } from "@/lib/analytics/access";
import type { Role } from "@/lib/workflow";
import type { ReportDef } from "@/lib/analytics/report";
import { computeReport } from "@/app/analiz/rapor/compute";
import { buildWorkbook, type ColType } from "@/lib/excel";
import { storage } from "@/lib/storage";
import { queueEmail, smtpConfigured } from "@/lib/notify";

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
      try {
        const c = await computeReport(def, scopeToFilter(sc.dataScope), { role: r.role });
        const { columns, rows, totals } = c.out;
        const totalsRow = Object.keys(totals).length ? { ...Object.fromEntries(columns.map((x) => [x.key, totals[x.key] ?? null])), [columns[0].key]: "Genel toplam" } : null;
        const { buffer, reportId } = await buildWorkbook({ title: def.title, meta: c.meta, preparedBy: "Zamanlanmış rapor", sheets: [{ name: def.title, columns: columns.map((x) => ({ key: x.key, header: x.label, type: (x.type === "date" ? "text" : x.type) as ColType })), rows: totalsRow ? [...rows, totalsRow] : rows, totals: false }] });
        const fname = `PILOTIS_${def.title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const key = (await storage.put(`raporlar/${sc.id}/${reportId}_${r.email.replace(/[^a-z0-9]/gi, "_")}.xlsx`, Buffer.from(buffer))).key;
        const o = await queueEmail(r.email, { kind: "REPORT", title: def.title, body: `${sc.dataScope} dönemi raporu ektedir (${rows.length} satır).\nRapor kimliği: ${reportId}. Faturalar TL kesilir; döviz gösterimleri bilgi amaçlıdır.`, link: "/analiz/rapor" }, [{ name: fname, storageKey: key, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }]);
        produced++; lines.push(`${r.email}: ${rows.length} satır · ${o.status === "SENT" ? "gönderildi" : o.status === "NO_CONFIG" ? "e-posta altyapısı yok, kuyrukta" : `hata: ${o.error}`}`);
      } catch (e) { lines.push(`${r.email}: ${(e as Error).message}`); }
    }
    const transport = smtpConfigured() ? "e-posta ile gönderildi" : "e-posta altyapısı tanımlı değil — dosyalar üretildi ve kuyrukta bekliyor";
    const result = `${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · ${produced}/${recips.length} alıcı · ${transport} · ${lines.join("; ")}`;
    await db.update(s.reportSchedules).set({ lastRunAt: new Date(), lastResult: result }).where(eq(s.reportSchedules.id, sc.id));
    await db.insert(s.auditLog).values({ entity: "report_schedule", entityId: sc.id, action: "RUN", after: { result }, actorId: "scheduler" });
    results.push({ id: sc.id, result });
  }
  return Response.json({ ran: results.length, results });
}
