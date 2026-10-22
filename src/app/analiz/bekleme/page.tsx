import Link from "next/link";
import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, hh, dt, tl, qs } from "../_lib";
import { AnalysisHeader, Tile } from "../_ui";
import { DEV_LABEL, opFinance } from "@/lib/analytics/model";
import { HBars, Columns } from "@/components/charts";
import { MIN, total, type Iv } from "@/lib/analytics/core";
import { ExportButton } from "../export-button";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";

export default async function Waiting({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (!a.access.planning) notFound();
  const { q } = peopleAndAssets(a);
  const { sc } = a;
  type W = { ref: string; reason: string; note: string | null; min: number; tugs: number; crew: number; at: number };
  const waits: W[] = [];
  for (const o of sc.ops) for (const w of sc.times.get(o.id)!.waiting) {
    const ps = sc.partsByOp.get(o.id) ?? [];
    const ov = (p: { from: number; to: number }) => total([[Math.max(p.from, w.iv[0]), Math.min(p.to, w.iv[1])] as Iv]);
    waits.push({ ref: o.ref, reason: w.reason ?? "OTHER", note: w.note, min: (w.iv[1] - w.iv[0]) / MIN, tugs: ps.filter((p) => p.assetId && !p.personnelId).reduce((s, p) => s + ov(p), 0), crew: ps.filter((p) => p.personnelId).reduce((s, p) => s + ov(p), 0), at: w.iv[0] });
  }
  const byR = new Map<string, { n: number; min: number; tug: number; crew: number }>();
  for (const w of waits) { const x = byR.get(w.reason) ?? { n: 0, min: 0, tug: 0, crew: 0 }; x.n++; x.min += w.min; x.tug += w.tugs; x.crew += w.crew; byR.set(w.reason, x); }
  const cancels = sc.ops.filter((o) => o.opStatus === "CANCELLED" || o.opStatus === "PARTIAL");
  const wasted = cancels.reduce((s, o) => s + (sc.partsByOp.get(o.id) ?? []).filter((p) => p.assetId && !p.personnelId).reduce((t, p) => t + (p.to - p.from), 0), 0);
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const w of waits) hourly[new Date(w.at + 3 * 3_600_000).getUTCHours()] += w.min;
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/bekleme" title="Bekleme ve kayıp zaman" q={q} actions={<ExportButton tab="bekleme" />}
        sub="Bekleme, intikal, arıza ve planlama gecikmelerinin etkisi. Neden kaydı ile sorumluluk kaydı ayrıdır." />
      <div className="tiles">
        <Tile l="Bekleme kaydı" v={waits.length} />
        <Tile l="Toplam bekleme" v={`${Math.round(waits.reduce((s, w) => s + w.min, 0) / 60).toLocaleString("tr-TR")} sa`} />
        <Tile l="Beklemede römorkör saati" v={`${hh(waits.reduce((s, w) => s + w.tugs, 0))} sa`} note="araç × süre" />
        <Tile l="Beklemede personel saati" v={`${hh(waits.reduce((s, w) => s + w.crew, 0))} sa`} note="kişi × süre" />
        <Tile l="İptal / tamamlanamayan iş" v={cancels.length} href={`/analiz/plan${qs(a.sp, { iptal: "1" })}`} />
        <Tile l="Boşa intikal (römorkör saati)" v={`${hh(wasted)} sa`} note="iptal/yarım kalan işlerde" />
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><HBars title="Bekleme nedenleri" note="Toplam süre (dk); alt bilgide kayıt sayısı ve bağlanan römorkör saati" series={[{ name: "Bekleme (dk)" }]} rows={[...byR].sort((x, y) => y[1].min - x[1].min).map(([k, v]) => ({ key: k, label: DEV_LABEL[k] ?? k, sub: `${v.n} kayıt · ${hh(v.tug)} römorkör-sa`, values: [Math.round(v.min)] }))} /></div>
        <div className="card"><Columns title="Beklemenin günün saatine göre dağılımı (dk)" series={[{ name: "Bekleme (dk)" }]} data={hourly.map((v, h) => ({ key: String(h), label: `${String(h).padStart(2, "0")}`, values: [Math.round(v)] }))} /></div>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><h3>En uzun beklemeler</h3><table><thead><tr><th>İş emri</th><th>Başlangıç</th><th className="numcell">Süre (dk)</th><th>Neden</th></tr></thead><tbody>{[...waits].sort((x, y) => y.min - x.min).slice(0, 15).map((w, i) => <tr key={i}><td><Link href={`/operasyonlar/${w.ref}`}>{w.ref}</Link></td><td>{dt(w.at)}</td><td className="numcell">{Math.round(w.min)}</td><td>{DEV_LABEL[w.reason] ?? w.reason}{w.note ? ` — ${w.note}` : ""}</td></tr>)}</tbody></table></div>
        <div className="card"><h3>İptal ve tamamlanamama</h3><table><thead><tr><th>İş emri</th><th>Durum</th><th>Neden</th>{a.access.finance && <th className="numcell">Faturalanan</th>}</tr></thead><tbody>{cancels.map((o) => <tr key={o.id}><td><Link href={`/operasyonlar/${o.ref}`}>{o.ref}</Link></td><td>{o.opStatus === "CANCELLED" ? "İptal" : "Kısmen"}</td><td>{o.events.find((e) => e.type === "CANCEL_OR_INCOMPLETE")?.note ?? o.cancelReason ?? "—"}</td>{a.access.finance && <td className="numcell">{tl(opFinance(a.ds, o.id).net)}</td>}</tr>)}{!cancels.length && <tr><td colSpan={4} className="muted">Kayıt yok</td></tr>}</tbody></table></div>
      </div>
    </>
  );
}
