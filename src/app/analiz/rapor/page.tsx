import { desc, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { analysis, qs } from "../_lib";
import { AnalysisHeader } from "../_ui";
import { reportData } from "./data";
import { Designer } from "./designer";
import { READY_REPORTS, type ReportDef } from "@/lib/analytics/report";
import { ANALYTICS_GLOSSARY } from "@/lib/analytics/model";
import type { SP } from "@/lib/analytics/load";
import { notFound } from "next/navigation";
import { Fragment } from "react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rapor oluşturucu" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (!a.access.reports) notFound();
  const data = reportData(a);
  const all = await db.select().from(s.reports).orderBy(desc(s.reports.updatedAt));
  const visible = all.filter((r) => r.scope === "CORPORATE" || r.scope === "TEAM" || r.ownerRole === a.role);
  const schedules = visible.length ? await db.select().from(s.reportSchedules).where(inArray(s.reportSchedules.reportId, visible.map((r) => r.id))) : [];
  const filters = qs(a.sp).replace(/^\?/, "");
  const openId = typeof a.sp.rapor === "string" ? a.sp.rapor : null;
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/rapor" title="Rapor oluşturucu" sub="Kod yazmadan rapor: alan, gruplama, ölçüm (toplam/ortalama/adet/en küçük/en büyük), oran, pivot ve grafik. Ölçüm tanımları sözlükten gelir ve burada değiştirilemez." />
      <Designer
        data={data} role={a.role} filters={filters} openId={openId}
        canCorporate={["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"].includes(a.role)}
        ready={READY_REPORTS.filter((r) => !r.finance || a.access.finance).map((r) => ({ key: r.key, title: r.title, def: r.def ?? null, href: r.href ? `${r.href}${r.href.includes("?") ? "&" : "?"}${filters}` : null }))}
        saved={visible.map((r) => ({ id: r.id, kind: r.kind as "TEMPLATE", name: r.name, scope: r.scope, owner: r.owner, ownerRole: r.ownerRole, version: r.version, def: r.definition as ReportDef, filters: r.filters, updatedAt: r.updatedAt.toISOString(), reportNo: (r.snapshot as { reportNo?: string } | null)?.reportNo ?? null, rowsCount: (r.snapshot as { rows?: unknown[] } | null)?.rows?.length ?? null }))}
        schedules={schedules.map((x) => ({ id: x.id, reportId: x.reportId, frequency: x.frequency, at: x.at, recipients: (x.recipients as { email: string; role: string }[]).map((r) => `${r.email} (${r.role})`).join(", "), format: x.format, dataScope: x.dataScope, lastResult: x.lastResult }))}
      />
      <div className="card" style={{ marginTop: 16 }} id="sozluk">
        <h3>Ölçüm sözlüğü</h3>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Rapor tasarımcısı ve bütün analiz ekranları bu tanımları kullanır; kullanıcı kolaylığı için gelir, çalışma saati veya tahsilat tanımı değiştirilemez.</div>
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(180px, 260px) 1fr", gap: "6px 14px", fontSize: 13, margin: 0 }}>{ANALYTICS_GLOSSARY.map((g) => <Fragment key={g.key}><dt style={{ fontWeight: 600 }}>{g.label}</dt><dd style={{ margin: 0 }}>{g.def}</dd></Fragment>)}</dl>
      </div>
    </>
  );
}
