import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { analysis, qs, hh, tl, dt, dd } from "../../_lib";
import { AnalysisHeader, Tile, roleTr, QualityStrip } from "../../_ui";
import { personStats, allocateRevenue, linesInScope, relatedNet, opFinance } from "@/lib/analytics/model";
import { quality } from "@/lib/analytics/insights";
import { H, MIN, DAY, trDay, dayStart, total, clip, intersect, type Iv } from "@/lib/analytics/core";
import { Columns, HBars } from "@/components/charts";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";
const CAT_COLOR: Record<string, string> = { WORK: "var(--series-1)", STANDBY: "var(--series-4)", TRAINING: "var(--series-3)", LEAVE: "var(--border)" };
const CAT_TR: Record<string, string> = { WORK: "Görev vardiyası", STANDBY: "Hazır bulunma", TRAINING: "Eğitim", LEAVE: "İzin" };

export default async function PersonDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const a = await analysis(searchParams);
  const p = a.ds.persons.find((x) => x.id === id);
  if (!p) notFound();
  if (a.access.people === "NONE" || (a.access.people !== "ALL" && !a.sc.persons.some((x) => x.id === id))) notFound(); // yetki: kendi / ekip
  const st = personStats(a.sc, p);
  const q = quality(a.sc, [st]);
  const certs = await db.select().from(s.certificates).where(eq(s.certificates.personnelId, id));
  const shifts = (a.sc.shiftsByPerson.get(id) ?? []).filter((x) => x.status !== "CANCELLED" && x.end > a.f.from && x.start < a.f.to).sort((x, y) => x.start - y.start);
  const parts = (a.sc.partsByPerson.get(id) ?? []).filter((x) => x.to > a.f.from && x.from < a.f.to).sort((x, y) => x.from - y.from);
  const alloc = a.access.finance ? allocateRevenue(a.ds, linesInScope(a.sc), "PERSONNEL").rows.filter((r) => r.targetId === id) : [];
  // Günlük çalışma: normal / fazla mesai
  const days: string[] = []; for (let t = a.f.from; t < a.f.to; t += DAY) days.push(trDay(t + 12 * H));
  const planned = shifts.filter((x) => x.category === "WORK").map((x) => [x.start, x.end] as Iv);
  const daily = days.map((d) => {
    const lo = dayStart(d), hi = lo + DAY;
    const act = clip(shifts.filter((x) => x.category === "WORK" && x.actualStart != null).map((x) => [x.actualStart!, x.actualEnd!] as Iv), lo, hi);
    const inPlan = total(intersect(act, planned)), all = total(act);
    const outside = total(clip(parts.map((x) => [x.from, x.to] as Iv), lo, hi)) - total(intersect(clip(parts.map((x) => [x.from, x.to] as Iv), lo, hi), act));
    return { d, normal: inPlan / H, ot: (all - inPlan + Math.max(0, outside)) / H };
  });
  const tugName = (aid: string | null) => a.ds.assets.find((x) => x.id === aid);
  const mates = new Map<string, number>(); for (const m of st.mates) mates.set(m, (mates.get(m) ?? 0) + 1);
  const opsById = new Map(a.ds.ops.map((o) => [o.id, o]));
  const initials = p.name.replace("ÖRNEK ", "").split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  const calDays = days.slice(-21);
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/personel" title={p.name.replace("ÖRNEK ", "")} sub={<><Link href={`/analiz/personel${qs(a.sp)}`}>← Personel analizi</Link> · <Link href={`/personel/${id}`}>Personel kartı</Link> · <Link href={`/planlama`}>Planlama</Link></>} />
      <QualityStrip q={q} asOf={a.ds.asOf} />
      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {p.photoUrl ? <img src={p.photoUrl} alt="" className="avatar" /> : <div className="avatar" aria-hidden>{initials}</div>}
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name.replace("ÖRNEK ", "")}</div>
          <div className="muted">{roleTr(p.crewRole)} · {p.title} · Ekip {p.teamKey ?? "—"} · Çalışma profili {p.workProfile === "STCW_MLC" ? "Gemiadamı (STCW/MLC)" : "İş Kanunu"}</div>
          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>{st.violations.some((v) => v.severity === "ERROR") ? <span className="badge bad">⛔ Dinlenme uygunluk uyarısı</span> : <span className="badge ok">✓ Dinlenme kuralları uygun</span>}{st.missing.length > 0 && <span className="badge warn">⚠ {st.missing.length} eksik zaman kaydı</span>}{st.pendingApproval > 0 && <span className="badge grey">{hh(st.pendingApproval)} sa onay bekliyor</span>}</div>
        </div>
      </div>
      <div className="tiles">
        <Tile l="Gerçekleşen çalışma" v={`${hh(st.actual)} sa`} note={`Planlanan ${hh(st.planned)} sa · fark ${hh(st.actual - st.planned)} sa`} href="#vardiyalar" />
        <Tile l="Normal mesai" v={`${hh(st.normal)} sa`} href="#vardiyalar" />
        <Tile l="Fazla mesai" v={`${hh(st.overtime)} sa`} note={`Onaylı ${hh(st.overtimeApproved)} sa`} href="#fazla-mesai" />
        <Tile l="Gece çalışması" v={`${hh(st.night)} sa`} note="20:00–06:00 arası gerçek saat" />
        <Tile l="Görev / vardiya" v={`${st.ops.length} / ${st.shiftCount}`} href="#gorevler" />
        <Tile l="Aktif hizmet · intikal · bekleme" v={`${hh(st.active)} · ${hh(st.transit)} · ${hh(st.waiting)}`} note="saat" href="#gorevler" />
        <Tile l="Hazır bulunma" v={`${hh(st.standby)} sa`} note="Çalışma/dinlenme sayımı R-029'a bağlı" />
        <Tile l="En düşük dinlenme" v={st.minRest24h == null ? "—" : `${(st.minRest24h / 60).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sa`} note={`24 saatlik pencerede · 7 günde ${st.minRest7d == null ? "—" : Math.round(st.minRest7d / 60) + " sa"}`} href="#dinlenme" />
        {a.access.finance && <Tile l="Katıldığı işlerin net faturası" v={tl(relatedNet(a.ds, st.ops))} note="Kişiler arasında toplanamaz" href="#gorevler" />}
        {a.access.finance && <Tile l="Dağıtılmış analitik gelir" v={tl(alloc.reduce((s2, r) => s2 + r.cents, 0))} note="Ücret, prim veya muhasebe geliri değildir" />}
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><Columns title="Günlük çalışma" note="Planlanan vardiya içindeki gerçekleşen (normal) ve vardiya dışına taşan (fazla mesai) saat" series={[{ name: "Normal" }, { name: "Fazla mesai" }]} unit=" sa" data={daily.map((x) => ({ key: x.d, label: `${x.d.slice(8)}.${x.d.slice(5, 7)}`, values: [Math.round(x.normal * 10) / 10, Math.round(x.ot * 10) / 10] }))} /></div>
        <div className="card"><HBars title="Operasyon türü dağılımı" series={[{ name: "İş sayısı" }]} rows={Object.entries(st.byType).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ key: k, label: `${k} · ${a.ds.ops.find((o) => o.typeCode === k)?.typeName ?? ""}`, values: [v] }))} /></div>
      </div>
      <div className="card" style={{ marginTop: 16 }} id="takvim">
        <h3>Vardiya takvimi (son {calDays.length} gün)</h3>
        <div className="legend" style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--muted)", flexWrap: "wrap", margin: "4px 0 8px" }}>
          {Object.entries(CAT_TR).map(([k, l]) => <span key={k}><i style={{ display: "inline-block", width: 10, height: 10, background: CAT_COLOR[k], borderRadius: 2, marginRight: 6 }} />{l} (plan)</span>)}
          <span><i style={{ display: "inline-block", width: 10, height: 4, background: "var(--series-2)", marginRight: 6, verticalAlign: 2 }} />Fiilî görev katılımı</span>
          <span><i style={{ display: "inline-block", width: 10, height: 10, border: "2px solid var(--bad)", marginRight: 6, boxSizing: "border-box" }} />Gerçekleşen vardiya dışı</span>
        </div>
        <div style={{ display: "grid", gap: 3, fontSize: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", color: "var(--muted)" }}><span /><div style={{ display: "flex", justifyContent: "space-between" }}>{[0, 6, 12, 18, 24].map((x) => <span key={x}>{String(x).padStart(2, "0")}:00</span>)}</div></div>
          {calDays.map((d) => {
            const lo = dayStart(d), hi = lo + DAY, pos = (t: number) => `${((Math.max(lo, Math.min(hi, t)) - lo) / DAY) * 100}%`, w = (a1: number, b1: number) => `${((Math.min(hi, b1) - Math.max(lo, a1)) / DAY) * 100}%`;
            return (
              <div key={d} style={{ display: "grid", gridTemplateColumns: "70px 1fr", alignItems: "center" }}>
                <span className="muted">{new Date(lo + 12 * H).toLocaleDateString("tr-TR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" })}</span>
                <div style={{ position: "relative", height: 18, background: "var(--surface-2)", borderRadius: 4 }}>
                  {[6, 12, 18].map((x) => <div key={x} style={{ position: "absolute", left: `${(x / 24) * 100}%`, top: 0, bottom: 0, width: 1, background: "var(--grid)" }} />)}
                  {shifts.filter((x) => x.end > lo && x.start < hi).map((x) => <div key={x.id} title={`${CAT_TR[x.category]} ${dt(x.start)}–${dt(x.end)}${x.actualEnd && x.actualEnd > x.end ? ` · gerçekleşen bitiş ${dt(x.actualEnd)}` : ""}`} style={{ position: "absolute", left: pos(x.start), width: w(x.start, x.end), top: 2, bottom: 2, background: CAT_COLOR[x.category], opacity: x.category === "LEAVE" ? 1 : 0.85, borderRadius: 3 }} />)}
                  {shifts.filter((x) => x.actualEnd && x.actualEnd > x.end && x.actualEnd > lo && x.end < hi).map((x) => <div key={`ot${x.id}`} title={`Fazla mesai ${dt(x.end)}–${dt(x.actualEnd!)}`} style={{ position: "absolute", left: pos(x.end), width: w(x.end, x.actualEnd!), top: 1, bottom: 1, border: "2px solid var(--bad)", borderRadius: 3, boxSizing: "border-box" }} />)}
                  {parts.filter((x) => x.to > lo && x.from < hi).map((x) => <Link key={x.id} href={`/operasyonlar/${opsById.get(x.opId)?.ref}`} title={`${opsById.get(x.opId)?.ref} ${dt(x.from)}–${dt(x.to)}`} style={{ position: "absolute", left: pos(x.from), width: w(x.from, x.to), bottom: 0, height: 5, background: "var(--series-2)", borderRadius: 2 }} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }} id="gorevler">
        <h3>Görev zaman çizelgesi ({parts.length} katılım kaydı)</h3>
        <div className="tablewrap" style={{ maxHeight: 420, overflow: "auto" }}>
          <table>
            <thead><tr><th>İş emri</th><th>Tür</th><th>Araç</th><th>Başlangıç</th><th>Bitiş</th><th className="numcell">Süre (sa)</th><th>Kaynak</th><th>Onay</th>{a.access.finance && <th className="numcell">İşin net faturası</th>}<th>Not</th></tr></thead>
            <tbody>{parts.map((x) => { const o = opsById.get(x.opId); return (
              <tr key={x.id}><td><Link href={`/operasyonlar/${o?.ref}`}>{o?.ref}</Link></td><td>{o?.typeName}</td><td>{tugName(x.assetId)?.code ?? "—"}</td><td>{dt(x.from)}</td><td>{dt(x.to)}</td><td className="numcell">{hh(x.to - x.from)}</td><td>{x.source === "OFFICIAL" ? "Resmî kayıt" : x.source === "MANUAL_CORRECTION" ? "Elle düzeltme" : "Tahmini"}</td><td>{x.approved ? "✓" : <span className="badge grey">bekliyor</span>}</td>{a.access.finance && <td className="numcell">{tl(opFinance(a.ds, x.opId).net)}</td>}<td className="muted">{x.note ?? ""}</td></tr>
            ); })}</tbody>
          </table>
        </div>
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <div className="card"><h3>Çalıştığı araçlar</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{st.tugs.map((t) => { const as = tugName(t); const hrs = total(parts.filter((x) => x.assetId === t).map((x) => [x.from, x.to] as Iv)); return <li key={t}>{as?.code ? <Link href={`/analiz/romorkor/${t}${qs(a.sp)}`}>{as.code} · {as.name}</Link> : as?.name} — {hh(hrs)} sa</li>; })}{!st.tugs.length && <li className="muted">Kayıt yok</li>}</ul></div>
        <div className="card"><h3>Birlikte çalıştığı kişiler</h3><ul style={{ margin: 0, paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>{st.mates.map((m) => { const mp = a.ds.persons.find((x) => x.id === m); return <li key={m}>{a.access.people === "ALL" ? <Link href={`/analiz/personel/${m}${qs(a.sp)}`}>{mp?.name.replace("ÖRNEK ", "")}</Link> : mp?.name.replace("ÖRNEK ", "")}</li>; })}{!st.mates.length && <li className="muted">Kayıt yok</li>}</ul></div>
        <div className="card" id="fazla-mesai"><h3>Fazla mesai nedenleri</h3><ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{st.overtimeReasons.map((r) => <li key={r}>{r.split(/(OP-\d{4}-\d{6})/).map((t, i) => (/^OP-/.test(t) ? <Link key={i} href={`/operasyonlar/${t}`}>{t}</Link> : t))}</li>)}{st.outsideShift > 0 && <li>Vardiya dışı görev katılımı: {hh(st.outsideShift)} sa (hazır bulunmadan çağrılma vb.)</li>}{!st.overtimeReasons.length && !st.outsideShift && <li className="muted">Fazla mesai yok</li>}</ul></div>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card" id="vardiyalar">
          <h3>Eksik, onay bekleyen ve düzeltilmiş zaman kayıtları</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
            {st.missing.map((m) => <li key={m.shiftId}><span className="badge warn">Eksik</span> {dt(m.start)}–{dt(m.end)} vardiyasının gerçekleşen kaydı yok (sıfır kabul edilmez)</li>)}
            {shifts.filter((x) => x.category === "WORK" && x.actualStart != null && !x.approved).slice(0, 12).map((x) => <li key={x.id}><span className="badge grey">Onay bekliyor</span> {dt(x.actualStart)}–{dt(x.actualEnd)}</li>)}
            {st.corrections.map((x) => <li key={x.id}><span className="badge demo">Elle düzeltme</span> {dt(x.start)} → {dt(x.actualStart)} · {x.correctionReason}</li>)}
            {!st.missing.length && !st.corrections.length && !shifts.some((x) => x.category === "WORK" && x.actualStart != null && !x.approved) && <li className="muted">Bekleyen kayıt yok</li>}
          </ul>
        </div>
        <div className="card" id="dinlenme">
          <h3>Dinlenme ve yeterlik</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{st.violations.slice(0, 8).map((v, i) => <li key={i} style={{ color: v.severity === "ERROR" ? "var(--bad)" : "var(--warn)" }}>{v.severity === "ERROR" ? "⛔" : "⚠"} {v.message} <span className="muted">({v.ruleRef})</span></li>)}{st.violations.length > 8 && <li className="muted">+{st.violations.length - 8} pencere daha</li>}{!st.violations.length && <li className="muted">Dinlenme ihlali yok</li>}</ul>
          <div className="sep" />
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{certs.map((c) => { const exp = c.expiresAt?.getTime(); const bad = exp != null && exp < a.ds.asOf, soon = exp != null && exp < a.ds.asOf + 30 * DAY; return <li key={c.id}>{c.name} ({c.number ?? "—"}) — {exp ? dd(exp) : "süresiz"} {bad ? <span className="badge bad">süresi dolmuş</span> : soon ? <span className="badge warn">yakında doluyor</span> : <span className="badge ok">geçerli</span>}</li>; })}{shifts.filter((x) => x.category === "TRAINING").map((x) => <li key={x.id}>Eğitim: {x.note ?? "—"} · {dt(x.start)}</li>)}</ul>
        </div>
      </div>
      {a.access.finance && <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Finansal bağlantı zinciri: fatura satırı → tahakkuk → hizmet/operasyon → bu kişinin katılım kaydı. Dağıtılmış analitik gelir {alloc.length} fatura satırından; yöntem: {alloc[0]?.method ?? "—"}. Bu tutarlar ücret, prim hakkı veya muhasebe geliri değildir.</div>}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Gerçekleşen = onaylı + onay bekleyen fiilî kayıtlar + vardiya dışı görev katılımı (çakışmalar bir kez).</div>
    </>
  );
}
