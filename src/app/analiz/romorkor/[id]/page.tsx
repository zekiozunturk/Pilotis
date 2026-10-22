import Link from "next/link";
import { notFound } from "next/navigation";
import { analysis, qs, hh, tl, dt, dd, pct } from "../../_lib";
import { AnalysisHeader, Tile, assetTr } from "../../_ui";
import { assetStats, allocateRevenue, linesInScope, relatedNet, opFinance, costByOp } from "@/lib/analytics/model";
import { H, DAY, trDay, dayStart, total, clip, type Iv } from "@/lib/analytics/core";
import { Columns } from "@/components/charts";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analiz — römorkör detayı" };
const DOWN_TR: Record<string, string> = { PLANNED_MAINTENANCE: "Planlı bakım", BREAKDOWN: "Arıza", CERTIFICATE: "Belge / sörvey", OTHER: "Diğer" };

export default async function TugDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const a = await analysis(searchParams);
  if (!a.access.fleet) notFound();
  const asset = a.ds.assets.find((x) => x.id === id); if (!asset) notFound();
  const st = assetStats(a.sc, asset);
  const peers = a.ds.assets.filter((x) => x.type === asset.type && x.mode === asset.mode && x.id !== id).map((x) => assetStats(a.sc, x));
  const peerUtil = peers.filter((x) => x.utilization != null).map((x) => x.utilization!);
  const alloc = a.access.finance ? allocateRevenue(a.ds, linesInScope(a.sc), "ASSET").rows.filter((r) => r.targetId === id) : [];
  const allocSum = alloc.reduce((s, r) => s + r.cents, 0);
  const costs = a.access.costs ? a.ds.costs.filter((c) => c.assetId === id && a.sc.inRange(dayStart(c.day) + 12 * H)) : [];
  const fuelCost = costs.filter((c) => c.category === "FUEL"), maint = costs.filter((c) => c.category === "MAINTENANCE");
  // Araca düşen dağıtılmış maliyet (ops üzerinden personel + genel gider payı): araç katılım saati oranında
  const cb = a.access.costs ? costByOp(a.sc) : null;
  let allocatedCost = 0;
  if (cb) for (const opId of st.ops) { const c = cb.byOp.get(opId) ?? {}; const parts = (a.sc.partsByOp.get(opId) ?? []).filter((p) => p.assetId && !p.personnelId && a.ds.assets.find((x) => x.id === p.assetId)?.type === "TUG"); const all = total(parts.map((p) => [p.from, p.to] as Iv)) || 1; const mine = total(parts.filter((p) => p.assetId === id).map((p) => [p.from, p.to] as Iv)); for (const [k, v] of Object.entries(c)) if (k === "PERSONNEL" || k === "OVERHEAD" || k === "OVERTIME") allocatedCost += (v * mine) / all; }
  const directCost = [...fuelCost, ...maint].reduce((s, c) => s + c.cents, 0);
  const costComplete = fuelCost.every((c) => c.nature === "ACTUAL");
  const parts = (a.sc.partsByAsset.get(id) ?? []).filter((x) => x.to > a.f.from && x.from < a.f.to).sort((x, y) => x.from - y.from);
  const days: string[] = []; for (let t = a.f.from; t < a.f.to; t += DAY) days.push(trDay(t + 12 * H));
  const meters = new Map(a.ds.meters.filter((m) => m.assetId === id).map((m) => [m.day, m]));
  const daily = days.map((d) => { const lo = dayStart(d); const p = total(clip(parts.map((x) => [x.from, x.to] as Iv), lo, lo + DAY)) / H; const m = meters.get(d); return { d, op: Math.round(p * 10) / 10, eng: m?.engineHours ?? 0 }; });
  const downs = a.ds.downtime.filter((d) => d.assetId === id && d.to > a.f.from && d.from < a.f.to);
  const opsById = new Map(a.ds.ops.map((o) => [o.id, o]));
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/romorkor" title={`${asset.code ?? ""} · ${asset.name}`} sub={<><Link href={`/analiz/romorkor${qs(a.sp)}`}>← Römorkör analizi</Link> · {assetTr(asset.type)} · {asset.mode === "NIGHT" ? "gece" : "gündüz"} grubu · çeki gücü {asset.bollardPullT ? `${asset.bollardPullT} t` : "doğrulanmadı (AK-01)"}</>} />
      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
        {asset.photoUrl ? <img src={asset.photoUrl} alt="" style={{ width: 180, height: 110, objectFit: "cover", borderRadius: 8, background: "var(--navy-100)" }} /> : <div style={{ width: 180, height: 110, borderRadius: 8, background: "var(--navy-100)", display: "grid", placeItems: "center", fontSize: 34, fontWeight: 800, color: "var(--navy-800)" }}>{asset.code}</div>}
        <div style={{ fontSize: 13 }}>Gruptaki araçların kullanım oranı: {peers.map((x) => `${x.asset.code} ${pct(x.utilization)}`).join(" · ") || "—"}<br />Bu araç: <b>{pct(st.utilization)}</b>{peerUtil.length ? ` · grup ortalaması ${pct(peerUtil.reduce((s, x) => s + x, 0) / peerUtil.length)}` : ""}<div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Düşük kullanım yedek kapasite tutulmasından veya görevlendirme kuralından kaynaklanabilir; tek başına performans göstergesi değildir.</div></div>
      </div>
      <div className="tiles">
        <Tile l="Planlanan kullanılabilir" v={`${hh(st.plannedAvailable)} sa`} note="Görevli ekip vardiyası" />
        <Tile l="Gerçek kullanılabilir" v={`${hh(st.available)} sa`} note={`Bakım/arıza ${hh(st.downTotal)} sa düşüldü`} href="#ariza" />
        <Tile l="Aktif hizmet" v={`${hh(st.active)} sa`} href="#gorevler" />
        <Tile l="İntikal · bekleme" v={`${hh(st.transit)} · ${hh(st.waiting)} sa`} href="#gorevler" />
        <Tile l="Hazır bulunma" v={`${hh(st.standby)} sa`} />
        <Tile l="Görev / manevra" v={st.ops.length} href="#gorevler" />
        <Tile l="Gündüz / gece katılım" v={`${hh(st.day)} / ${hh(st.night)} sa`} />
        <Tile l="Motor saati (sayaç)" v={st.engineHours == null ? "—" : `${st.engineHours.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sa`} note="Operasyon saatiyle aynı ölçüm değildir" />
        <Tile l="Yakıt" v={`${Math.round(st.fuelMeasured + st.fuelEstimated).toLocaleString("tr-TR")} L`} note={`Ölçülen ${Math.round(st.fuelMeasured).toLocaleString("tr-TR")} · tahmini ${Math.round(st.fuelEstimated).toLocaleString("tr-TR")}`} />
        <Tile l="Planlanan / gerçekleşen görev saati" v={`${hh(st.plannedHours)} / ${hh(st.participation)} sa`} />
        {a.access.finance && <Tile l="Katıldığı işlerin net faturası" v={tl(relatedNet(a.ds, st.ops))} note="Araçlar arasında toplanamaz" />}
        {a.access.finance && <Tile l="Dağıtılmış analitik gelir" v={tl(allocSum)} note={alloc[0]?.method ? `Yöntem: ${alloc[0].method}` : undefined} />}
        {a.access.costs && <Tile l="Araç maliyeti (yakıt + bakım)" v={tl(directCost)} note={costComplete ? "gerçekleşen" : "tahmini yakıt içerir"} />}
        {a.access.costs && <Tile l="Dağıtılmış personel + genel gider" v={tl(Math.round(allocatedCost))} note="katılım saati oranında" />}
        {a.access.finance && a.access.costs && <Tile l={costComplete ? "Katkı sonucu (analitik)" : "Katkı sonucu — tahmini maliyet içerir"} v={tl(Math.round(allocSum - directCost - allocatedCost))} note="Muhasebe kârı değildir" />}
      </div>
      <div className="card" style={{ marginTop: 16 }}><Columns title="Günlük operasyon saati ve motor saati" note="İki ayrı ölçüm yan yana: operasyon katılım saati (kayıt) ve motor saati (sayaç). Toplanmazlar." series={[{ name: "Operasyon katılım saati" }]} unit=" sa" data={daily.map((x) => ({ key: x.d, label: `${x.d.slice(8)}.${x.d.slice(5, 7)}`, values: [x.op] }))} />
        <Columns series={[{ name: "Motor saati (sayaç)", slot: 6 }]} unit=" sa" data={daily.map((x) => ({ key: x.d, label: `${x.d.slice(8)}.${x.d.slice(5, 7)}`, values: [x.eng] }))} height={140} /></div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card" id="ariza"><h3>Bakım ve arıza</h3><ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{downs.map((d, i) => <li key={i}><b>{DOWN_TR[d.kind] ?? d.kind}</b> {dt(d.from)} – {dt(d.to)} ({hh(d.to - d.from)} sa) · {d.note}</li>)}{!downs.length && <li className="muted">Dönemde kayıt yok</li>}</ul>
          {a.access.costs && maint.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Bakım/onarım maliyeti: {maint.map((c) => `${tl(c.cents)} (${c.day})`).join(", ")}</div>}</div>
        <div className="card"><h3>Yakıt kayıtları</h3><div className="muted" style={{ fontSize: 12 }}>{meters.size} günlük sayaç kaydı; {[...meters.values()].filter((m) => m.measured).length} gün ölçülen, {[...meters.values()].filter((m) => !m.measured).length} gün tahmini tüketim.{a.access.costs && ` Yakıt maliyeti ${tl(fuelCost.reduce((s, c) => s + c.cents, 0))} (${fuelCost.filter((c) => c.nature === "ESTIMATE").length} kayıt tahmini).`}</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }} id="gorevler">
        <h3>Görevler ({parts.length})</h3>
        <div className="tablewrap" style={{ maxHeight: 420, overflow: "auto" }}><table>
          <thead><tr><th>İş emri</th><th>Tür</th><th>Gemi</th><th>Başlangıç</th><th>Bitiş</th><th className="numcell">Süre (sa)</th>{a.access.finance && <><th className="numcell">İşin net faturası</th><th className="numcell">Bu araca dağıtılan</th></>}</tr></thead>
          <tbody>{parts.map((x) => { const o = opsById.get(x.opId); return <tr key={x.id}><td><Link href={`/operasyonlar/${o?.ref}`}>{o?.ref}</Link></td><td>{o?.typeName}</td><td>{o?.vesselName.replace("ÖRNEK ", "")}</td><td>{dt(x.from)}</td><td>{dt(x.to)}</td><td className="numcell">{hh(x.to - x.from)}</td>{a.access.finance && <><td className="numcell">{tl(opFinance(a.ds, x.opId).net)}</td><td className="numcell">{tl(alloc.filter((r) => r.opId === x.opId).reduce((s, r) => s + r.cents, 0))}</td></>}</tr>; })}</tbody>
        </table></div>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Dönem {dd(a.f.from)} – {dd(a.f.to - 1)}.</div>
    </>
  );
}
