import Link from "next/link";
import { analysis, peopleAndAssets, tl, tlc, hh, qs, pct } from "./_lib";
import { AnalysisHeader, Tile } from "./_ui";
import { financeSummary, results, bucketOf, personStats, assetStats } from "@/lib/analytics/model";
import { alertsFor, narrative } from "@/lib/analytics/insights";
import { H, total } from "@/lib/analytics/core";
import { Columns } from "@/components/charts";
import type { SP } from "@/lib/analytics/load";
import { redirect } from "next/navigation";
import { ExportButton } from "./export-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analiz — yönetici özeti" };

export default async function Summary({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (a.access.people === "SELF" || a.access.people === "TEAM") redirect(`/analiz/personel${qs(a.sp)}`);
  if (a.access.people === "NONE") redirect(`/analiz/finans${qs(a.sp)}`);
  const { ps, as, q } = peopleAndAssets(a);
  const { sc, csc, access } = a;
  const done = sc.ops.filter((o) => sc.times.get(o.id)!.completed);
  const cancelled = sc.ops.filter((o) => o.opStatus === "CANCELLED");
  const act = (s: typeof sc) => s.ops.reduce((x, o) => x + total(s.times.get(o.id)!.service), 0);
  const cps = csc ? csc.persons.map((p) => personStats(csc, p)) : null;
  const sum = (xs: { actual: number }[] | null, k: "actual" | "overtime" | "night") => (xs ? (xs as unknown as Record<string, number>[]).reduce((s, x) => s + x[k], 0) : null);
  const fs = access.finance ? financeSummary(sc) : null, cfs = access.finance && csc ? financeSummary(csc) : null;
  const res = access.costs ? results(sc, (o) => ({ key: o.typeCode, label: o.typeName })) : null;
  const alerts = alertsFor(sc, ps, as, a.ds.alertCfg).filter((x) => access.finance || x.area !== "FİNANS");
  const narr = narrative(alerts, ps, as);
  // Dönem serisi
  const buckets = new Map<string, { done: number; cancel: number; night: number }>();
  for (const o of sc.ops) { const t = sc.times.get(o.id)!; const k = bucketOf(t.serviceDate, a.f.grain); const b = buckets.get(k) ?? { done: 0, cancel: 0, night: 0 }; if (o.opStatus === "CANCELLED") b.cancel++; else if (t.night) b.night++; else b.done++; buckets.set(k, b); }
  const series = [...buckets].sort(([x], [y]) => x.localeCompare(y));
  const capNow = as.filter((x) => x.asset.type === "TUG").reduce((s, x) => s + x.available, 0);
  const capPrev = csc ? csc.assets.filter((x) => x.type === "TUG").map((x) => assetStats(csc, x)).reduce((s, x) => s + x.available, 0) : null;
  const sev = { CRITICAL: "bad", WARNING: "warn", INFO: "info" } as const;
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz" title="Yönetici özeti" q={q} actions={<ExportButton tab="ozet" />}
        sub="Finansal sonuç, iş yükü ve emniyet göstergeleri ayrı gösterilir; yüksek fatura tutarı tek başına personel veya kaptan başarısı sayılmaz." />
      {capPrev != null && capPrev > 0 && Math.abs(capNow - capPrev) / capPrev > 0.05 && <div className="alert info" style={{ marginBottom: 10 }}><span>ⓘ</span><div>Karşılaştırılan dönemlerin kapasitesi farklı: römorkör kullanılabilir saati {hh(capNow)} sa / önceki {hh(capPrev)} sa (dönem uzunluğu, bakım/arıza ve vardiya farkı). Mutlak değerler yerine oranları karşılaştırın.</div></div>}
      <h2 style={{ fontSize: 15, margin: "6px 0 8px" }}>Operasyon ve iş yükü</h2>
      <div className="tiles">
        <Tile l="Tamamlanan iş" v={done.length} cur={done.length} prev={csc ? csc.ops.filter((o) => csc.times.get(o.id)!.completed).length : null} href={`/analiz/plan${qs(a.sp)}`} />
        <Tile l="İptal / tamamlanamayan" v={cancelled.length + sc.ops.filter((o) => o.opStatus === "PARTIAL").length} good="down" cur={cancelled.length} prev={csc ? csc.ops.filter((o) => o.opStatus === "CANCELLED").length : null} href={`/analiz/bekleme${qs(a.sp)}`} />
        <Tile l="Aktif hizmet (iş süresi)" v={`${hh(act(sc))} sa`} cur={act(sc)} prev={csc ? act(csc) : null} fmt={(x) => `${hh(x)} sa`} />
        <Tile l="Personel gerçekleşen çalışma" v={`${hh(sum(ps, "actual")!)} sa`} cur={sum(ps, "actual")!} prev={sum(cps, "actual")} good="none" fmt={(x) => `${hh(x)} sa`} href={`/analiz/personel${qs(a.sp)}`} />
        <Tile l="Fazla mesai" v={`${hh(sum(ps, "overtime")!)} sa`} cur={sum(ps, "overtime")!} prev={sum(cps, "overtime")} good="down" fmt={(x) => `${hh(x)} sa`} />
        <Tile l="Gece çalışması" v={`${hh(sum(ps, "night")!)} sa`} cur={sum(ps, "night")!} prev={sum(cps, "night")} good="none" fmt={(x) => `${hh(x)} sa`} />
        <Tile l="Römorkör kullanım oranı" v={pct(capNow ? as.filter((x) => x.asset.type === "TUG").reduce((s, x) => s + x.active + x.transit + x.waiting, 0) / capNow : null)} note="aktif+intikal+bekleme / kullanılabilir" href={`/analiz/romorkor${qs(a.sp)}`} />
        <Tile l="Dinlenme ihlali olan kişi" v={ps.filter((p) => p.violations.some((v) => v.severity === "ERROR")).length} good="down" href={`/analiz/emniyet${qs(a.sp)}`} />
      </div>
      {fs && (
        <>
          <h2 style={{ fontSize: 15, margin: "18px 0 8px" }}>Finansal sonuç <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>vergi hariç net · TL · {fs.basis === "SERVICE" ? "hizmet tarihine göre" : "seçili tarih esasına göre"}</span></h2>
          <div className="tiles">
            <Tile l="Onaylı tahakkuk" v={tlc(fs.accrual)} cur={fs.accrual} prev={cfs?.accrual} fmt={tlc} href={`/analiz/finans${qs(a.sp)}`} />
            <Tile l="Net fatura" v={tlc(fs.net)} cur={fs.net} prev={cfs?.net} fmt={tlc} href={`/analiz/finans${qs(a.sp)}`} />
            <Tile l="Faturalanmamış tahakkuk" v={tlc(fs.unbilledAccrual)} good="down" cur={fs.unbilledAccrual} prev={cfs?.unbilledAccrual} href={`/analiz/finans${qs(a.sp, { muhasebe: "AWAITING_EXPORT" })}`} />
            <Tile l="Tahsilat (eşleşmiş)" v={tlc(fs.collected)} note="vergi dahil" cur={fs.collected} prev={cfs?.collected} />
            <Tile l="Açık alacak" v={tlc(fs.open)} good="down" note="vergi dahil" cur={fs.open} prev={cfs?.open} />
            <Tile l="İtirazlı tutar" v={tl(fs.disputed)} good="down" cur={fs.disputed} prev={cfs?.disputed} />
            {res && <Tile l={res.complete ? "Analitik sonuç" : "Analitik sonuç (eksik/tahmini maliyet)"} v={tlc(res.total.result)} note={`Katkı ${tlc(res.total.contribution)} · tahmini maliyet payı %${Math.round(res.total.estimateShare * 100)}`} href={`/analiz/finans${qs(a.sp)}#sonuc`} />}
          </div>
        </>
      )}
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <Columns title={`İş adedi (${{ day: "günlük", week: "haftalık", month: "aylık", quarter: "çeyreklik", year: "yıllık" }[a.f.grain]})`} note="Çubuğa tıklayınca o dönemin plan–gerçekleşen kayıtları açılır."
            series={[{ name: "Gündüz tamamlanan" }, { name: "Gece tamamlanan" }, { name: "İptal" , slot: 3 }]}
            data={series.map(([k, b]) => ({ key: k, label: k.startsWith("H ") ? k.slice(7) : k.length === 10 ? k.slice(8) + "." + k.slice(5, 7) : k, values: [b.done, b.night, b.cancel], href: k.length === 10 ? `/analiz/plan${qs(a.sp, { bas: k, bit: k })}` : undefined }))} />
        </div>
        <div className="card">
          <h3>Otomatik değerlendirme</h3>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>Kural tabanlı gözlemlerdir; kesin bulgu değildir ve disiplin, ücret ya da prim kararı içermez. Her gözlem kaynak kayıtlara bağlanır.</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "grid", gap: 6 }}>{narr.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Kritik uyarılar ({alerts.length})</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {alerts.slice(0, 12).map((x, i) => (
            <div key={i} className={`alert ${sev[x.severity]}`}>
              <span aria-hidden>{x.severity === "CRITICAL" ? "⛔" : x.severity === "WARNING" ? "⚠" : "ⓘ"}</span>
              <div><b>{x.severity === "CRITICAL" ? "Kritik" : x.severity === "WARNING" ? "Uyarı" : "Bilgi"} · {x.area} — {x.title}</b>{x.detail} {x.links.map((l) => <Link key={l.href} href={l.href.includes("?") ? l.href : `${l.href}${qs(a.sp)}`} style={{ marginLeft: 8 }}>{l.label} →</Link>)}</div>
            </div>
          ))}
          {alerts.length > 12 && <div className="muted">+{alerts.length - 12} uyarı daha — ilgili sekmelerde</div>}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Eşikler <Link href="/analiz/emniyet#esikler">Emniyet ve yorgunluk → uyarı eşikleri</Link> bölümünden yetkili kullanıcı tarafından değiştirilebilir.</div>
      </div>
      {res && <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>{res.scopeNote}</div>}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Kullanılabilir römorkör saati: {hh(capNow)} sa · göstergelerin tanımları <Link href={`/analiz/rapor${qs(a.sp)}#sozluk`}>ölçüm sözlüğünde</Link>.</div>
    </>
  );
}
