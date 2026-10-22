import Link from "next/link";
import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, qs, hh } from "../_lib";
import { AnalysisHeader, Tile, roleTr } from "../_ui";
import { alertsFor, ALERT_LABEL } from "@/lib/analytics/insights";
import { HBars } from "@/components/charts";
import { H } from "@/lib/analytics/core";
import { AlertCfgForm, AllocationForm } from "../settings-forms";
import { ExportButton } from "../export-button";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analiz — emniyet ve yorgunluk" };

export default async function Safety({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (!a.access.safety) notFound();
  const { ps, as, q } = peopleAndAssets(a);
  const viol = ps.filter((p) => p.violations.some((v) => v.severity === "ERROR"));
  const alerts = alertsFor(a.sc, ps, as, a.ds.alertCfg).filter((x) => x.area === "EMNİYET" || x.area === "İŞ YÜKÜ" || x.area === "VERİ");
  const exc = a.ds.shifts.filter((s) => s.exception && a.sc.inRange(s.start) && a.sc.persons.some((p) => p.id === s.personnelId));
  const h = (m: number | null) => (m == null ? null : Math.round(m / 6) / 10);
  const canEdit = ["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"].includes(a.role);
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/emniyet" title="Emniyet ve yorgunluk" q={q} actions={<ExportButton tab="emniyet" />}
        sub="Uygunluk kontrolleri ve risk göstergeleri; kişinin çalışma profiline (STCW/MLC veya İş Kanunu) göre kayan pencerelerle. Uyarılar disiplin veya ücret kararı değildir." />
      <div className="tiles">
        <Tile l="Dinlenme ihlali olan kişi" v={`${viol.length} / ${ps.filter((p) => p.available).length}`} good="down" />
        <Tile l="En kötü 24 saatlik dinlenme" v={`${Math.min(...ps.map((p) => p.minRest24h ?? 1e9)) === 1e9 ? "—" : (Math.min(...ps.map((p) => p.minRest24h ?? 1e9)) / 60).toFixed(1) + " sa"}`} note="gerekli 10 sa (gemiadamı)" />
        <Tile l="En kötü 7 günlük dinlenme" v={`${Math.min(...ps.map((p) => p.minRest7d ?? 1e9)) === 1e9 ? "—" : Math.round(Math.min(...ps.map((p) => p.minRest7d ?? 1e9)) / 60) + " sa"}`} note="gerekli 77 sa (gemiadamı)" />
        <Tile l="Acil durum istisnası" v={exc.length} note="Yetkili onaylı, telafi planlı" />
        <Tile l="Toplam gece çalışması" v={`${hh(ps.reduce((s, p) => s + p.night, 0))} sa`} />
      </div>
      {viol.length > ps.length / 2 && <div className="alert bad" style={{ marginTop: 12 }}><span>⛔</span><div><b>İhlaller kişisel değil, sistemsel görünüyor</b>Personelin yarısından fazlasında aynı tür ihlal var — kaynak büyük olasılıkla vardiya/rotasyon modelidir. Önce <Link href="/planlama/rotasyon">ekip rotasyonunu</Link> değerlendirin.</div></div>}
      <div className="card" style={{ marginTop: 16 }}>
        <HBars title="Kişi bazında en düşük 24 saatlik dinlenme (sa)" note="Kısa çubuk = daha az dinlenme. Gemiadamı için alt sınır 10 sa. Satıra tıklayınca kişi sayfası." series={[{ name: "En düşük 24s dinlenme" }]} unit=" sa" total={false}
          rows={[...ps].filter((p) => p.minRest24h != null).sort((x, y) => (x.minRest24h ?? 0) - (y.minRest24h ?? 0)).map((p) => ({ key: p.person.id, label: p.person.name.replace("ÖRNEK ", ""), sub: roleTr(p.person.crewRole), flag: p.violations.some((v) => v.severity === "ERROR") ? "ihlal" : undefined, href: `/analiz/personel/${p.person.id}${qs(a.sp)}`, values: [h(p.minRest24h) ?? 0] }))} maxRows={20} />
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>Uyarılar ({alerts.length})</h3>
        <div style={{ display: "grid", gap: 6 }}>{alerts.map((x, i) => <div key={i} className={`alert ${x.severity === "CRITICAL" ? "bad" : x.severity === "WARNING" ? "warn" : "info"}`}><span aria-hidden>{x.severity === "CRITICAL" ? "⛔" : x.severity === "WARNING" ? "⚠" : "ⓘ"}</span><div><b>{x.title}</b>{x.detail} {x.links.map((l) => <Link key={l.href} href={l.href} style={{ marginLeft: 8 }}>{l.label} →</Link>)}</div></div>)}</div>
      </div>
      {exc.length > 0 && <div className="card" style={{ marginTop: 16 }}><h3>Acil durum istisnaları</h3><ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{exc.map((s) => { const e = s as unknown as { exception: boolean }; return <li key={s.id}>{a.ds.persons.find((p) => p.id === s.personnelId)?.name.replace("ÖRNEK ", "")} · {new Date(s.start).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</li>; })}</ul></div>}
      <div className="card" style={{ marginTop: 16 }} id="esikler"><h3>Uyarı eşikleri</h3><AlertCfgForm cfg={a.ds.alertCfg as unknown as Record<string, number>} labels={ALERT_LABEL} canEdit={canEdit} /></div>
      {a.access.finance && <div className="card" style={{ marginTop: 16 }} id="dagitim"><h3>Gelir dağıtım yöntemi (sürümlü)</h3><AllocationForm method={a.ds.alloc.method} weights={a.ds.alloc.roleWeights} version={a.ds.alloc.version} approvedBy={a.ds.alloc.approvedBy} note={a.ds.alloc.note} canEdit={["SYSTEM_ADMIN", "BUSINESS_MANAGER"].includes(a.role)} /></div>}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Hazır bulunma süresinin çalışma/dinlenme sınıflandırması onaylı kurala (R-029) bağlıdır; kural taslak olduğu için dinlenme kontrolünde ihtiyatlı olarak çalışma sayılır, çalışma saati göstergelerinde ise ayrı (hazır bulunma) kolonda gösterilir.</div>
    </>
  );
}
