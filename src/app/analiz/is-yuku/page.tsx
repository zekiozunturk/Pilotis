import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, qs } from "../_lib";
import { AnalysisHeader, roleTr } from "../_ui";
import { balance } from "@/lib/analytics/insights";
import { Heatmap } from "@/components/charts";
import { H, DAY, trDay, dayStart, total, clip, minus, type Iv } from "@/lib/analytics/core";
import { ExportButton } from "../export-button";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";

export default async function Workload({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (a.access.people !== "ALL") notFound();
  const { ps, as, q } = peopleAndAssets(a);
  const days: string[] = []; for (let t = a.f.from; t < a.f.to; t += DAY) days.push(trDay(t + 12 * H));
  const cols = days.slice(-42).map((d) => ({ key: d, label: `${d.slice(8)}.${d.slice(5, 7)}` }));
  const sorted = [...ps].filter((p) => p.person.crewRole !== "KIYI_OPS").sort((x, y) => (x.person.teamKey ?? "zz").localeCompare(y.person.teamKey ?? "zz", "tr", { numeric: true }) || (x.person.crewRole ?? "").localeCompare(y.person.crewRole ?? ""));
  const leaveOf = (pid: string, d: string) => (a.sc.shiftsByPerson.get(pid) ?? []).some((s) => s.category === "LEAVE" && s.start < dayStart(d) + DAY && s.end > dayStart(d));
  const pVals = sorted.map((p) => cols.map((c) => (leaveOf(p.person.id, c.key) ? null : Math.round(((p.dailyActual.get(c.key) ?? 0) / H) * 10) / 10)));
  const tugs = as.filter((x) => x.asset.type === "TUG").sort((x, y) => (x.asset.code ?? "").localeCompare(y.asset.code ?? "", "tr", { numeric: true }));
  const tVals = tugs.map((t) => cols.map((c) => {
    const lo = dayStart(c.key), hi = lo + DAY;
    const down = a.ds.downtime.filter((d) => d.assetId === t.asset.id).map((d) => [d.from, d.to] as Iv);
    if (total(clip(down, lo, hi)) >= 6 * H) return null; // bakım/arıza günü — karşılaştırma dışı
    const parts = (a.sc.partsByAsset.get(t.asset.id) ?? []).map((p) => [p.from, p.to] as Iv);
    return Math.round((total(clip(minus(parts, down), lo, hi)) / H) * 10) / 10;
  }));
  const bal = balance(ps);
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/is-yuku" title="İş yükü dengesi ve kapasite" q={q} actions={<ExportButton tab="is-yuku" />}
        sub="Tek bir toplam puan yerine açıklanabilir göstergeler. İzinli personel ve bakımdaki araç taralı gösterilir ve karşılaştırmaya alınmaz; az görev alan araç “düşük performans” sayılmaz." />
      <div className="card"><h3>Rol bazında denge</h3>
        <table><thead><tr><th>Rol</th><th className="numcell">Karşılaştırılan</th><th className="numcell">Hariç (görevsiz/izinli)</th><th className="numcell">Ortalama çalışma (sa)</th><th className="numcell">Standart sapma (sa)</th><th className="numcell">Değişim katsayısı</th><th className="numcell">Ortalama gece (sa)</th><th>Yorum</th></tr></thead>
          <tbody>{bal.map((b) => <tr key={b.role}><td>{roleTr(b.role)}</td><td className="numcell">{b.compared}</td><td className="numcell">{b.excluded}</td><td className="numcell">{b.mean.toFixed(1)}</td><td className="numcell">{b.sd.toFixed(1)}</td><td className="numcell">%{Math.round(b.cv * 100)}</td><td className="numcell">{b.nightMean.toFixed(1)}</td><td className="muted">{b.cv < 0.1 ? "Dengeli" : b.cv < 0.2 ? "Hafif dengesiz — incele" : "Dengesiz — yeterlik, izin ve araç uygunluğunu incele"}</td></tr>)}</tbody></table>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Değişim katsayısı = standart sapma / ortalama. Ağırlık ve kapsam açık: yalnız dönemde görevi olan kişiler; izin, eğitim ve zorunlu hazır bulunma ayrı kayıtlardır.</div>
      </div>
      <div className="card" style={{ marginTop: 16 }}><Heatmap title="Personel — günlük gerçekleşen çalışma (sa)" note={`Son ${cols.length} gün. Satır adına tıklayınca kişi sayfası açılır.`} unit=" sa" max={16} empty="İzinli"
        rows={sorted.map((p) => ({ key: p.person.id, label: p.person.teamKey ? `${p.person.teamKey} · ${roleTr(p.person.crewRole)}` : p.person.name.replace("ÖRNEK ", ""), href: `/analiz/personel/${p.person.id}${qs(a.sp)}` }))} cols={cols} values={pVals} /></div>
      <div className="card" style={{ marginTop: 16 }}><Heatmap title="Römorkör — günlük görev katılım saati" note="Bakım/arıza nedeniyle 6 saatten fazla kullanılamayan günler taralı ve karşılaştırma dışıdır." unit=" sa" empty="Bakım/arıza"
        rows={tugs.map((t) => ({ key: t.asset.id, label: `${t.asset.code} · ${t.asset.mode === "NIGHT" ? "gece" : "gündüz"}`, href: `/analiz/romorkor/${t.asset.id}${qs(a.sp)}` }))} cols={cols} values={tVals} /></div>
    </>
  );
}
