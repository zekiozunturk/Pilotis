import Link from "next/link";
import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, qs, tl, tlc, dd } from "../_lib";
import { AnalysisHeader, SheetTable, Tile } from "../_ui";
import { opSheet, resultSheet } from "../tables";
import { financeSummary, opFinance, allocateRevenue, linesInScope, bucketOf, BASIS_LABEL, results } from "@/lib/analytics/model";
import { H, dayStart } from "@/lib/analytics/core";
import { Columns, HBars } from "@/components/charts";
import { ExportButton } from "../export-button";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analiz — fatura ve tahakkuk" };

export default async function FinanceAnalysis({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (!a.access.finance) notFound();
  const { q } = peopleAndAssets(a);
  const { sc, csc } = a;
  const fs = financeSummary(sc), cfs = csc ? financeSummary(csc) : null;
  const ops = opSheet(sc, a.access);
  const unbilled = sc.ops.filter((o) => { const x = opFinance(a.ds, o.id); return x.accrualApproved && !x.invoiceIds.length; });
  const pending = sc.ops.filter((o) => sc.times.get(o.id)!.completed && o.accrualStatus !== "APPROVED");
  const unmatched = a.ds.payments.filter((p) => sc.inRange(dayStart(p.date) + 12 * H) && p.cents > p.matches.reduce((s, m) => s + m.cents, 0));
  const al = allocateRevenue(a.ds, linesInScope(sc), "ASSET");
  const res = a.access.costs ? results(sc, (o) => ({ key: o.typeCode, label: o.typeName })) : null;
  // Dönem serisi: hizmet esasında net fatura / tahakkuk
  const b = new Map<string, { net: number; unbilled: number }>();
  for (const o of sc.ops) { const x = opFinance(a.ds, o.id); const k = bucketOf(sc.times.get(o.id)!.serviceDate, a.f.grain); const r = b.get(k) ?? { net: 0, unbilled: 0 }; r.net += x.net; if (x.accrualApproved && !x.invoiceIds.length) r.unbilled += x.accrual ?? 0; b.set(k, r); }
  const byCust = new Map<string, { net: number; open: number; disputed: number; collected: number }>();
  for (const o of sc.ops) { const x = opFinance(a.ds, o.id); const k = o.billingPartyId ?? "-"; const r = byCust.get(k) ?? { net: 0, open: 0, disputed: 0, collected: 0 }; r.net += x.net; r.open += x.open; r.disputed += x.disputed; r.collected += x.collected; byCust.set(k, r); }
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/finans" title="Fatura ve tahakkuk analizi" q={q} actions={<ExportButton tab="finans" />}
        sub={<>Tarih esası: <b>{BASIS_LABEL[a.f.basis]}</b> — “Ekim'de yapılan işlerin faturaları” (hizmet tarihi) ile “Ekim'de kesilen faturalar” (fatura tarihi) farklı raporlardır. Gelir vergi hariç net tutardır; faturalar TL kesilir.</>} />
      {a.f.basis === "COLLECTION" && <div className="alert info" style={{ marginBottom: 10 }}><span>ⓘ</span><div>Tahsilat esasında yalnız faturayla eşleşmiş tahsilat işlere bağlanır; eşleşmeyen tahsilat ayrı gösterilir ve hiçbir personel veya araca yazılmaz.</div></div>}
      <div className="tiles">
        <Tile l="Tahmini teklif tutarı" v={tlc(fs.estimate)} note="Hizmet öncesi tahmin" cur={fs.estimate} prev={cfs?.estimate} good="none" />
        <Tile l="Onaylı tahakkuk" v={tlc(fs.accrual)} cur={fs.accrual} prev={cfs?.accrual} />
        <Tile l="Faturalanmamış tahakkuk" v={tlc(fs.unbilledAccrual)} good="down" cur={fs.unbilledAccrual} prev={cfs?.unbilledAccrual} href="#faturalanmamis" />
        <Tile l="Düzenlenmiş fatura" v={tlc(fs.invoiced)} cur={fs.invoiced} prev={cfs?.invoiced} />
        <Tile l="İptal / iade / düzeltme etkisi" v={tlc(fs.credit)} good="none" />
        <Tile l="Net fatura (vergi hariç)" v={tlc(fs.net)} cur={fs.net} prev={cfs?.net} />
        <Tile l="Vergi" v={tlc(fs.tax)} note="KDV eşlemesi AK-12'de" />
        <Tile l="Tahsilat (eşleşmiş)" v={tlc(fs.collected)} note="vergi dahil" cur={fs.collected} prev={cfs?.collected} />
        <Tile l="Açık alacak" v={tlc(fs.open)} note="vergi dahil" good="down" />
        <Tile l="İtirazlı tutar" v={tl(fs.disputed)} good="down" />
        {a.f.basis === "COLLECTION" && <Tile l="Faturayla eşleşmeyen tahsilat" v={tl(fs.unmatchedPayments)} note="İşe/kişiye yazılmaz" />}
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><Columns title="Hizmet dönemine göre net fatura ve faturalanmamış tahakkuk" note="Geç kesilen fatura, hizmetin yapıldığı döneme bağlanır." series={[{ name: "Net fatura" }, { name: "Faturalanmamış tahakkuk" }]} format="int" unit=" TL"
          data={[...b].sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => ({ key: k, label: k.length === 10 ? `${k.slice(8)}.${k.slice(5, 7)}` : k.replace("H ", ""), values: [Math.round(v.net / 100), Math.round(v.unbilled / 100)] }))} /></div>
        <div className="card"><HBars title="Müşteri bazında tahsilat ve açık alacak (vergi dahil)" note="Satıra tıklayınca müşteri filtresi uygulanır. İtirazlı tutar tabloda ayrı kolondadır." series={[{ name: "Tahsil edilen" }, { name: "Açık alacak" }]} format="int" unit=" TL"
          rows={[...byCust].sort((x, y) => y[1].net - x[1].net).map(([k, v]) => ({ key: k, label: (a.ds.parties[k] ?? "—").replace("ÖRNEK ", ""), href: `/analiz/finans${qs(a.sp, { musteri: k })}`, sub: v.disputed ? `itirazlı ${Math.round(v.disputed / 100).toLocaleString("tr-TR")} TL` : undefined, values: [Math.round(v.collected / 100), Math.round(v.open / 100)] }))} /></div>
      </div>
      {res && (
        <div className="card" style={{ marginTop: 16 }} id="sonuc">
          <h3>Maliyet ve sonuç — {res.label}</h3>
          {!res.complete && <div className="alert warn" style={{ margin: "6px 0" }}><span>⚠</span><div>Maliyetlerin %{Math.round(res.total.estimateShare * 100)}'i tahmini{res.missingCats.length ? `; eksik kategori: ${res.missingCats.join(", ")}` : ""}. Sonuç “net kâr” olarak adlandırılmaz.</div></div>}
          {(["type", "customer", "night"] as const).map((k) => <div key={k} style={{ marginTop: 10 }}><SheetTable sheet={resultSheet(sc, k)} maxRows={30} /></div>)}
        </div>
      )}
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card" id="faturalanmamis"><h3>Tamamlanmış fakat faturalanmamış işler ({unbilled.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, maxHeight: 260, overflow: "auto" }}>{unbilled.map((o) => { const x = opFinance(a.ds, o.id); const t = sc.times.get(o.id)!; return <li key={o.id}><Link href={`/operasyonlar/${o.ref}`}>{o.ref}</Link> · {dd(t.serviceDate)} · {(a.ds.parties[o.billingPartyId ?? ""] ?? "").replace("ÖRNEK ", "")} · tahakkuk {tl(x.accrual ?? 0)} · {Math.floor((a.ds.asOf - t.serviceDate) / 86_400_000)} gün</li>; })}{!unbilled.length && <li className="muted">Yok</li>}</ul>
          {pending.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Ayrıca {pending.length} tamamlanmış iş tahakkuk onayı bekliyor (faturalanamaz).</div>}</div>
        <div className="card"><h3>Fatura – tahakkuk farkı ({fs.invoiceDiff.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{fs.invoiceDiff.map((d) => <li key={d.opId}><Link href={`/operasyonlar/${d.ref}`}>{d.ref}</Link> · tahakkuk {tl(d.accrual)} · fatura {tl(d.net)} · fark {tl(d.net - d.accrual)}</li>)}{!fs.invoiceDiff.length && <li className="muted">Fark yok</li>}</ul>
          <div className="sep" />
          <h3>Faturayla eşleşmeyen tahsilat ({unmatched.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{unmatched.map((p) => <li key={p.id}>{p.date} · {(a.ds.parties[p.partyId] ?? "").replace("ÖRNEK ", "")} · {tl(p.cents - p.matches.reduce((s, m) => s + m.cents, 0))} · {p.reference}</li>)}{!unmatched.length && <li className="muted">Yok</li>}</ul>
          <div className="muted" style={{ fontSize: 11.5 }}>Eşleşmeyen tahsilat tahminle işe, personele veya araca yazılmaz.</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Gelir dağıtımı (araç)</h3>
        <div style={{ fontSize: 13 }}>Kaynak gelir {tl(al.sourceCents)} · dağıtılan {tl(al.allocatedCents)} · dağıtılamayan {tl(al.unallocated.reduce((s, u) => s + u.cents, 0))} — <b>{al.allocatedCents + al.unallocated.reduce((s, u) => s + u.cents, 0) === al.sourceCents ? "mutabık ✓" : "mutabakat farkı!"}</b></div>
        <div className="muted" style={{ fontSize: 12 }}>Yöntem: {al.methodNote}. Tek araçlı satırlar doğrudan ilişkilendirilir; elle dağıtım yalnız gerekçeli ve yetkili onaylı yapılır. Dağıtılamama nedenleri: {[...new Set(al.unallocated.map((u) => u.reason))].join(" · ") || "—"}.</div>
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>İş emri bazında finans</h3><SheetTable sheet={ops} links={ops.links} maxRows={300} /></div>
    </>
  );
}
