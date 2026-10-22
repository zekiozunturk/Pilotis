import Link from "next/link";
import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, qs, hh, tl, dt } from "../_lib";
import { AnalysisHeader, roleTr } from "../_ui";
import { opFinance, allocateRevenue, linesInScope } from "@/lib/analytics/model";
import { H, DAY, trDay, dayStart, total, clip, splitDayNight, type Iv } from "@/lib/analytics/core";
import { ExportButton } from "../export-button";
import type { SP } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analiz — ekip ve vardiya" };

export default async function Teams({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (a.access.people !== "ALL" && a.access.people !== "TEAM") notFound();
  const { ps, q } = peopleAndAssets(a);
  const teams = [...new Set(ps.map((p) => p.person.teamKey).filter(Boolean) as string[])].sort((x, y) => x.localeCompare(y, "tr", { numeric: true }));
  const alloc = a.access.finance ? allocateRevenue(a.ds, linesInScope(a.sc), "PERSONNEL").rows : [];
  const lastDay = trDay(Math.min(a.f.to - 1, a.ds.asOf));
  const day = typeof a.sp.gun === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.sp.gun) ? a.sp.gun : lastDay;
  const lo = dayStart(day), hi = lo + DAY;
  const tug = (id: string | null) => a.ds.assets.find((x) => x.id === id);
  // Seçilen günün vardiya kartları: o gün başlayan ekip vardiyaları
  const cards = teams.map((t) => {
    const members = a.ds.persons.filter((p) => p.teamKey === t);
    const shifts = members.flatMap((m) => (a.sc.shiftsByPerson.get(m.id) ?? []).filter((s) => s.category === "WORK" && s.status !== "CANCELLED" && s.start >= lo && s.start < hi).map((s) => ({ m, s })));
    if (!shifts.length) return null;
    const start = Math.min(...shifts.map((x) => x.s.start)), end = Math.max(...shifts.map((x) => x.s.end));
    const actualEnd = Math.max(...shifts.map((x) => x.s.actualEnd ?? x.s.end));
    const partsIn = members.flatMap((m) => (a.sc.partsByPerson.get(m.id) ?? []).filter((p) => p.to > start && p.from < actualEnd).map((p) => ({ m, p })));
    const opIds = [...new Set(partsIn.map((x) => x.p.opId))];
    const ops = opIds.map((id) => a.sc.opById.get(id)!).filter(Boolean);
    const leaves = members.filter((m) => (a.sc.shiftsByPerson.get(m.id) ?? []).some((s) => s.category === "LEAVE" && s.start < end && s.end > start));
    const work = shifts.reduce((s, x) => s + ((x.s.actualEnd ?? x.s.end) - (x.s.actualStart ?? x.s.start)), 0);
    const ot = shifts.reduce((s, x) => s + Math.max(0, (x.s.actualEnd ?? x.s.end) - x.s.end), 0);
    const pending = shifts.filter((x) => x.s.actualStart != null && !x.s.approved).length, missing = shifts.filter((x) => x.s.actualStart == null && x.s.end < a.ds.asOf).length;
    let wait = 0, transit = 0;
    for (const o of ops) { const tm = a.sc.times.get(o.id)!; transit += total(tm.transit); wait += tm.waiting.reduce((s, w) => s + (w.iv[1] - w.iv[0]), 0); }
    return { t, members, shifts, start, end, actualEnd, partsIn, ops, leaves, work, ot, pending, missing, wait, transit, night: splitDayNight([[start, end]]).night > (end - start) / 2, tugs: [...new Set(shifts.map((x) => x.s.assetId))] };
  }).filter(Boolean) as NonNullable<ReturnType<typeof Object>>[];
  const prev = trDay(lo - 12 * H), next = trDay(hi + 12 * H);
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/ekip" title="Ekip ve vardiya analizi" q={q} actions={<ExportButton tab="ekip" />}
        sub="Ekip bileşimi, iş yükü ve ilişkili finansal sonuçlar. Vardiya içinde personel değişirse iş, fiilî katılım aralıklarına göre bölünür; tamamı vardiya başındaki ekibe yazılmaz." />
      <div className="card">
        <h3>Ekip özeti</h3>
        <div className="tablewrap"><table>
          <thead><tr><th>Ekip</th><th>Römorkör</th><th className="numcell">Kişi</th><th className="numcell">Gerçekleşen (sa)</th><th className="numcell">Fazla mesai (sa)</th><th className="numcell">Gece (sa)</th><th className="numcell">Görev (iş)</th><th className="numcell">Bekleme (sa)</th><th className="numcell">İntikal (sa)</th><th className="numcell">Onay bekleyen (sa)</th><th className="numcell">Eksik kayıt</th><th className="numcell">Dinlenme ihlali (kişi)</th>{a.access.finance && <><th className="numcell" title="Ekipler arasında toplanamaz">Katıldığı işlerin net faturası ⓘ</th><th className="numcell">Dağıtılmış analitik gelir</th></>}</tr></thead>
          <tbody>{teams.map((t) => {
            const xs = ps.filter((p) => p.person.teamKey === t); const ops = [...new Set(xs.flatMap((x) => x.ops))];
            const tugId = (a.sc.shiftsByPerson.get(xs[0]?.person.id ?? "") ?? []).find((s) => s.assetId)?.assetId ?? null;
            return <tr key={t}><td><Link href={`/analiz/personel${qs(a.sp, { ekip: t })}`}>{t}</Link></td><td>{tug(tugId)?.code ?? "—"}</td><td className="numcell">{xs.length}</td><td className="numcell">{hh(xs.reduce((s, x) => s + x.actual, 0))}</td><td className="numcell">{hh(xs.reduce((s, x) => s + x.overtime, 0))}</td><td className="numcell">{hh(xs.reduce((s, x) => s + x.night, 0))}</td><td className="numcell">{ops.length}</td><td className="numcell">{hh(xs.reduce((s, x) => s + x.waiting, 0))}</td><td className="numcell">{hh(xs.reduce((s, x) => s + x.transit, 0))}</td><td className="numcell">{hh(xs.reduce((s, x) => s + x.pendingApproval, 0))}</td><td className="numcell">{xs.reduce((s, x) => s + x.missing.length, 0)}</td><td className="numcell">{xs.filter((x) => x.violations.some((v) => v.severity === "ERROR")).length}</td>{a.access.finance && <><td className="numcell">{tl(ops.reduce((s, o) => s + opFinance(a.ds, o).net, 0))}</td><td className="numcell">{tl(alloc.filter((r) => xs.some((x) => x.person.id === r.targetId)).reduce((s, r) => s + r.cents, 0))}</td></>}</tr>;
          })}</tbody>
        </table></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 8px" }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Vardiya kartları — {new Date(lo + 12 * H).toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long", timeZone: "Europe/Istanbul" })}</h2>
        <Link className="btn secondary" href={`/analiz/ekip${qs(a.sp, { gun: prev })}`}>← Önceki gün</Link><Link className="btn secondary" href={`/analiz/ekip${qs(a.sp, { gun: next })}`}>Sonraki gün →</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <div key={c.t} className="card" style={{ borderTop: `3px solid ${c.night ? "var(--series-7)" : "var(--series-1)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><b>{c.t} · {c.tugs.map((x: string | null) => tug(x)?.code).join(", ")}</b><span className="badge grey">{c.night ? "☾ Gece" : "☀ Gündüz"}</span></div>
            <div className="muted" style={{ fontSize: 12 }}>{dt(c.start)} – {dt(c.end)}{c.actualEnd > c.end ? <> · gerçekleşen bitiş <b style={{ color: "var(--bad)" }}>{dt(c.actualEnd)}</b></> : null}</div>
            <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
              {c.members.map((m: { id: string; name: string; crewRole: string | null; photoUrl: string | null }) => { const on = c.shifts.some((x: { m: { id: string } }) => x.m.id === m.id); const left = c.leaves.some((l: { id: string }) => l.id === m.id); return (
                <Link key={m.id} href={`/analiz/personel/${m.id}${qs(a.sp)}`} title={`${m.name} — ${roleTr(m.crewRole)}${left ? " (izinli)" : !on ? " (vardiyada değil)" : ""}`} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, padding: "3px 8px 3px 3px", borderRadius: 999, background: left ? "var(--surface-2)" : "var(--navy-100)", color: "var(--text)", opacity: on ? 1 : 0.55, textDecoration: left ? "line-through" : "none" }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 10 }}>{roleTr(m.crewRole).slice(0, 2)}</span>{roleTr(m.crewRole)}
                </Link>); })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 12.5 }}>
              <span>Planlanan ekip <b>{c.members.length - c.leaves.length}/{c.members.length}</b></span><span>Fiilî katılan <b>{new Set(c.partsIn.map((x: { m: { id: string } }) => x.m.id)).size}</b></span>
              <span>Tamamlanan iş <b>{c.ops.filter((o: { opStatus: string }) => o.opStatus === "COMPLETED").length}</b></span><span>İptal/yarım <b>{c.ops.filter((o: { opStatus: string }) => o.opStatus === "CANCELLED" || o.opStatus === "PARTIAL").length}</b></span>
              <span>Çalışma <b>{hh(c.work)} sa</b></span><span>Fazla mesai <b>{hh(c.ot)} sa</b></span>
              <span>Bekleme <b>{hh(c.wait)} sa</b></span><span>İntikal <b>{hh(c.transit)} sa</b></span>
              {a.access.finance && <span style={{ gridColumn: "1 / -1" }}>İlişkili işlerin net faturası <b>{tl(c.ops.reduce((s: number, o: { id: string }) => s + opFinance(a.ds, o.id).net, 0))}</b> · tahakkuku onaylı {c.ops.filter((o: { accrualStatus: string }) => o.accrualStatus === "APPROVED").length}/{c.ops.length}</span>}
            </div>
            {(c.pending > 0 || c.missing > 0) && <div className="alert warn" style={{ marginTop: 8, fontSize: 12 }}><span>⚠</span><div>{c.missing ? `${c.missing} kişinin gerçekleşen kaydı eksik. ` : ""}{c.pending ? `${c.pending} kayıt onay/devir-teslim bekliyor.` : ""}</div></div>}
            {c.ops.length > 0 && <div style={{ fontSize: 12, marginTop: 6 }}>{c.ops.map((o: { id: string; ref: string }) => <Link key={o.id} href={`/operasyonlar/${o.ref}`} style={{ marginRight: 8 }}>{o.ref}</Link>)}</div>}
          </div>
        ))}
        {!cards.length && <div className="muted">Bu gün başlayan ekip vardiyası yok.</div>}
      </div>
    </>
  );
}
