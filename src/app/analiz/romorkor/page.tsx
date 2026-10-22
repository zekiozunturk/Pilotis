import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, qs } from "../_lib";
import { AnalysisHeader, SheetTable } from "../_ui";
import { assetSheet } from "../tables";
import { HBars } from "@/components/charts";
import { H } from "@/lib/analytics/core";
import { ExportButton } from "../export-button";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";

export default async function TugAnalysis({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (!a.access.fleet) notFound();
  const { as, q } = peopleAndAssets(a);
  const tugs = as.filter((x) => x.asset.type === "TUG").sort((x, y) => (x.asset.code ?? "").localeCompare(y.asset.code ?? "", "tr", { numeric: true }));
  const sheet = assetSheet(a.sc, as, a.access);
  const h = (ms: number) => Math.round((ms / H) * 10) / 10;
  const group = (mode: "DAY" | "NIGHT") => tugs.filter((t) => t.asset.mode === mode);
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/romorkor" title="Römorkör analizi" q={q} actions={<ExportButton tab="romorkor" />}
        sub="Araçlar farklı çeki gücü ve görev kabiliyetine sahip olduğundan ham saat veya ciroyla sıralanmaz; karşılaştırma aynı gruptaki (gündüz/gece, çeki gücü) araçlar arasında yapılır." />
      {tugs.some((t) => !t.asset.bollardPullT) && <div className="alert warn" style={{ marginBottom: 12 }}><span>⚠</span><div>Çeki gücü doğrulanmamış römorkörler (AK-01) yalnız görev grubuna (gündüz/gece) göre karşılaştırılır.</div></div>}
      <div className="grid g2">
        {(["DAY", "NIGHT"] as const).map((m) => (
          <div className="card" key={m}>
            <HBars title={`${m === "DAY" ? "Gündüz" : "Gece"} grubu — kullanılabilir saatin dağılımı`} note="Bakım/arıza süresi kullanılabilir saatten düşülür. Hazır bulunma = görevli fakat iş kaydı olmayan süre; düşük kullanım yedek kapasite tutulmasından kaynaklanabilir."
              series={[{ name: "Aktif hizmet" }, { name: "İntikal" }, { name: "Bekleme" }, { name: "Hazır bulunma" }]} unit=" sa"
              rows={group(m).map((t) => ({ key: t.asset.id, label: `${t.asset.code} · ${t.asset.name}`, sub: t.utilization == null ? undefined : `%${Math.round(t.utilization * 100)} kullanım`, flag: t.downTotal > 0 ? `${h(t.downTotal)} sa bakım/arıza` : undefined, href: `/analiz/romorkor/${t.asset.id}${qs(a.sp)}`, values: [h(t.active), h(t.transit), h(t.waiting), h(t.standby)] }))} />
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>Araç tablosu</h3><SheetTable sheet={sheet} links={sheet.links} /></div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Motor saati sayaçtan, operasyon saati katılım kayıtlarından, ücretlendirilen miktar tarifeden gelir — üçü aynı ölçüm değildir. Yakıtta ölçülen ve tahmini değerler ayrı kolonlardadır.</div>
    </>
  );
}
