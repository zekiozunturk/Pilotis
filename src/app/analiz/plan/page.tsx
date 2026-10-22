import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, hh } from "../_lib";
import { AnalysisHeader, SheetTable, Tile } from "../_ui";
import { planSheet } from "../tables";
import { planActual, DEV_LABEL } from "@/lib/analytics/model";
import { HBars } from "@/components/charts";
import { MIN } from "@/lib/analytics/core";
import { ExportButton } from "../export-button";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analiz — plan/gerçekleşen" };

export default async function PlanActual({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (!a.access.planning) notFound();
  const { q } = peopleAndAssets(a);
  const rows = planActual(a.sc);
  const sheet = planSheet(a.sc, a.access);
  const started = rows.filter((r) => r.startDelay != null);
  const late = started.filter((r) => r.startDelay! > 15 * MIN);
  const durOver = rows.filter((r) => r.plannedDur && r.actualDur && r.actualDur > r.plannedDur * 1.2);
  const tugDiff = rows.filter((r) => r.plannedTugs !== r.actualTugs && r.op.opStatus !== "CANCELLED");
  const byReason = new Map<string, { n: number; min: number }>();
  for (const r of rows) for (const d of r.reasons) { const x = byReason.get(d.category) ?? { n: 0, min: 0 }; x.n++; x.min += d.minutes ?? 0; byReason.set(d.category, x); }
  const est = rows.reduce((s, r) => s + (r.final != null ? r.estimate ?? 0 : 0), 0), fin = rows.reduce((s, r) => s + (r.final ?? 0), 0);
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/plan" title="Plan – gerçekleşen karşılaştırması" q={q} actions={<ExportButton tab="plan" />}
        sub="Her iş için planlanan/gerçek başlangıç, süre, kaynak ve tutar. Sapma nedeni ile sorumluluk kaydı ayrı tutulur; sistem kimseyi otomatik sorumlu ilan etmez." />
      <div className="tiles">
        <Tile l="Başlayan iş" v={started.length} />
        <Tile l="15 dk'dan fazla geç başlayan" v={`${late.length} (%${started.length ? Math.round((late.length / started.length) * 100) : 0})`} good="down" />
        <Tile l="Ortalama başlangıç sapması" v={`${started.length ? Math.round(started.reduce((s, r) => s + r.startDelay!, 0) / started.length / MIN) : 0} dk`} />
        <Tile l="Süresi tahminin %20 üstünde" v={durOver.length} />
        <Tile l="Römorkör sayısı plandan farklı" v={tugDiff.length} />
        {a.access.finance && <Tile l="Tahmini → nihai tahakkuk" v={`${est ? ((fin / est - 1) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "—"}%`} note="Tahakkuku olan işlerde" good="none" />}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <HBars title="Sapma nedenleri" note="Kayıtlı neden sayısı ve toplam etkisi (dk). Neden, sorumluluk anlamına gelmez."
          series={[{ name: "Etkilenen süre (dk)" }]} rows={[...byReason].sort((x, y) => y[1].min - x[1].min).map(([k, v]) => ({ key: k, label: DEV_LABEL[k] ?? k, sub: `${v.n} kayıt`, values: [v.min] }))} />
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>İş bazında plan – gerçekleşen</h3><SheetTable sheet={sheet} links={sheet.links} highlight={(r) => Number(r.delay) > 15} /></div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Planlanan kaynak saati toplamı {hh(a.ds.plans.reduce((s, p) => s + (p.to - p.from), 0))} sa (yüklenen kayıtlar).</div>
    </>
  );
}
