import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentPersonId, currentRole, requireUser, ROLE_LABELS } from "@/lib/session";
import { evaluate, type Interval } from "@/lib/planning/rest";
import { profileByCode } from "@/lib/planning/profiles";
import { fmtDT, fmtMin, fmtTime } from "@/lib/format";
import { OPERATION_TYPES } from "@/data/catalog";
import { STATUS_SETS } from "@/lib/labels";

export const metadata = { title: "Görevlerim" };
export const dynamic = "force-dynamic";
const H = 3_600_000, DAY = 24 * H;
const OPL = STATUS_SETS.find((x) => x.key === "opStatus")!.values;
const CAT: Record<string, string> = { WORK: "Görev", STANDBY: "Hazır bulunma", TRAINING: "Eğitim", LEAVE: "İzin" };

export default async function Saha() {
  const u = await requireUser();
  const role = await currentRole();
  const me = await currentPersonId();
  const [person] = me ? await db.select().from(s.personnel).where(eq(s.personnel.id, me)) : [];
  if (!person) {
    return <div className="card"><h1>Görevlerim</h1><p className="muted">Hesabınız bir personel kaydına bağlı değil. Sistem yöneticisinden kullanıcı kaydınızı personel kartınızla eşleştirmesini isteyin.</p></div>;
  }
  const now = Date.now();
  const shifts = await db.select({ sh: s.shifts, a: s.fleetAssets }).from(s.shifts).leftJoin(s.fleetAssets, eq(s.fleetAssets.id, s.shifts.assetId))
    .where(and(eq(s.shifts.personnelId, person.id), gte(s.shifts.endAt, new Date(now - 8 * DAY)), lt(s.shifts.startAt, new Date(now + 8 * DAY)))).orderBy(asc(s.shifts.startAt));
  const cur = shifts.find((x) => x.sh.startAt.getTime() <= now && x.sh.endAt.getTime() > now);
  const next = shifts.find((x) => x.sh.startAt.getTime() > now && x.sh.category !== "LEAVE");
  // İşler: fiilî katılım + plan ataması
  const parts = await db.select({ op: s.operations.id, from: s.participations.from, to: s.participations.to, role: s.participations.roleOnTask }).from(s.participations)
    .where(and(eq(s.participations.personnelId, person.id), gte(s.participations.to, new Date(now - 7 * DAY)))).orderBy(desc(s.participations.from)).innerJoin(s.operations, eq(s.operations.id, s.participations.operationId));
  const asg = await db.select({ op: s.assignments.operationId, from: s.assignments.from, to: s.assignments.to, role: s.assignments.roleOnTask }).from(s.assignments)
    .where(and(eq(s.assignments.personnelId, person.id), gte(s.assignments.to, new Date(now - DAY))));
  const opIds = [...new Set([...parts, ...asg].map((x) => x.op))];
  const ops = opIds.length ? await db.select({ op: s.operations, vessel: s.vessels.name, gt: s.vessels.gt }).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId)).where(inArray(s.operations.id, opIds)) : [];
  // Ekibimdeki römorkörün açık işleri (römorkör kaptanı için)
  const teamOps = role === "TUG_MASTER" && cur?.a ? await db.select({ op: s.operations, vessel: s.vessels.name }).from(s.assignments).innerJoin(s.operations, eq(s.operations.id, s.assignments.operationId)).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .where(and(eq(s.assignments.assetId, cur.a.id), gte(s.assignments.to, new Date(now)))) : [];
  const facs = await db.select({ id: s.facilities.id, n: s.facilities.name }).from(s.facilities);
  const fac = (id: string | null) => facs.find((f) => f.id === id)?.n ?? "—";
  const typeName = (c: string) => OPERATION_TYPES.find((t) => t.code === c)?.nameTr ?? c;
  const upcoming = [...new Map([...asg, ...parts].filter((x) => x.to.getTime() >= now).map((x) => [x.op, x])).values()].sort((a, b) => a.from.getTime() - b.from.getTime());
  const done = parts.filter((x) => x.to.getTime() < now).slice(0, 12);
  const opOf = (id: string) => ops.find((o) => o.op.id === id);
  // Dinlenme değerlendirmesi: son 7 gün
  const profile = profileByCode(person.workProfile);
  const iv: Interval[] = shifts.map((x) => ({ start: x.sh.startAt.getTime(), end: x.sh.endAt.getTime(), category: x.sh.category as Interval["category"] }));
  const ev = evaluate(iv, profile, now - 7 * DAY, now);
  const rest24 = ev.metrics.minRest24h, rest7 = ev.metrics.minRest7d;
  const lastWorkEnd = Math.max(0, ...shifts.filter((x) => x.sh.category === "WORK" && x.sh.endAt.getTime() <= now).map((x) => x.sh.endAt.getTime()));
  const restNow = cur?.sh.category === "WORK" ? 0 : lastWorkEnd ? (now - lastWorkEnd) / 60000 : null;
  const team = person.rotationTeam ? await db.select({ id: s.personnel.id, n: s.personnel.fullName, t: s.personnel.title }).from(s.personnel).where(and(eq(s.personnel.rotationTeam, person.rotationTeam), eq(s.personnel.active, true))) : [];
  const gauge = (v: number | null, min: number | null | undefined, label: string) => {
    const pct = v == null || !min ? null : Math.min(100, Math.round((v / min) * 100));
    const ok = v != null && min != null && v >= min;
    return (
      <div className="tile">
        <div className="l">{label}</div>
        <div className="v">{fmtMin(v)}</div>
        {min != null && <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0} aria-label={label}><span style={{ width: `${pct ?? 0}%` }} className={ok ? "ok" : "bad"} /></div>}
        <div className={`d ${ok ? "up" : v == null ? "" : "down"}`}>{min != null ? `${ok ? "✓ Uygun" : "⚠ Altında"} · en az ${fmtMin(min)}` : "Sınır tanımsız"}</div>
      </div>
    );
  };
  void or; void u;
  return (
    <>
      <div className="pagehead">
        <div><h1>Görevlerim</h1><div className="muted">{person.fullName.replace("ÖRNEK ", "")} · {ROLE_LABELS[role]}{person.rotationTeam ? ` · Ekip ${person.rotationTeam}` : ""}</div></div>
        <div className="toolbar"><Link className="btn secondary" href="/analiz/personel">Çalışma saatlerim</Link><Link className="btn secondary" href="/planlama/rotasyon">Ekip rotasyonu</Link></div>
      </div>

      <div className={`duty card ${cur?.sh.category === "WORK" ? "on" : ""} ${(cur?.a ?? next?.a)?.photoUrl ? "with-photo" : ""}`}>
        {(() => { const a = cur?.a ?? next?.a; return a?.photoUrl ? <img className="duty-photo" src={a.photoUrl} alt={a.photoIllustrative ? "Temsili römorkör fotoğrafı" : a.name} /> : null; })()}
        {cur ? <>
          <div className="duty-k">{cur.sh.category === "WORK" ? "Şu an görevdesiniz" : `Şu an: ${CAT[cur.sh.category]}`}</div>
          <div className="duty-v">{cur.a ? `${cur.a.name} (${cur.a.code ?? ""})` : role === "PILOT" ? "Kılavuzluk vardiyası" : "Vardiya"} · {fmtTime(cur.sh.startAt)}–{fmtTime(cur.sh.endAt)}</div>
          <div className="muted">Vardiya bitimine {fmtMin(Math.round((cur.sh.endAt.getTime() - now) / 60000))}</div>
        </> : <>
          <div className="duty-k">Şu an görevde değilsiniz</div>
          <div className="duty-v">{next ? `Sonraki: ${fmtDT(next.sh.startAt)} · ${next.a?.name ?? CAT[next.sh.category]}` : "Planlanmış görev yok"}</div>
          {restNow != null && <div className="muted">Son görevden bu yana dinlenme: {fmtMin(Math.round(restNow))}</div>}
        </>}
      </div>

      <h2 style={{ margin: "18px 0 8px" }}>Dinlenme durumum <span className="muted small">({profile.name.split(" (")[0]})</span></h2>
      <div className="tiles">
        {gauge(rest24, profile.minRest24h, "En kötü 24 saatteki dinlenme")}
        {gauge(rest7, profile.minRest7d, "Son 7 gündeki dinlenme")}
        <div className="tile"><div className="l">Son 7 gün çalışma · gece</div><div className="v">{fmtMin(ev.metrics.workMinutes)}</div><div className="d">gece {fmtMin(ev.metrics.nightMinutes)} · {ev.metrics.nightShifts} gece görevi</div></div>
        <div className="tile"><div className="l">Kural uyarısı (7 gün)</div><div className="v">{ev.violations.length}</div><div className={`d ${ev.violations.some((v) => v.severity === "ERROR") ? "down" : ""}`}>{ev.violations[0]?.message.slice(0, 70) ?? "Uyarı yok"}</div></div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Sıradaki işlerim</h2>
          {upcoming.length === 0 && teamOps.length === 0 ? <div className="empty">Size atanmış yaklaşan iş yok. Yeni iş atandığında burada görünür.</div> : (
            <ul className="jobs">
              {[...upcoming.map((x) => ({ o: opOf(x.op), from: x.from, role: x.role })), ...teamOps.filter((t) => !upcoming.some((x) => x.op === t.op.id)).map((t) => ({ o: t, from: t.op.plannedStart ?? new Date(), role: "Römorkör" }))].map(({ o, from, role: r }) => o && (
                <li key={o.op.id}>
                  <div className="when"><b>{fmtTime(from)}</b><span>{fmtDT(from).split(" ")[0]}</span></div>
                  <div className="what"><b>{o.vessel}</b> · {typeName(o.op.typeCode)}<div className="muted small">{fac(o.op.fromFacilityId)} → {fac(o.op.toFacilityId)}{r ? ` · ${r}` : ""}</div></div>
                  <span className="badge grey">{OPL[o.op.opStatus] ?? o.op.opStatus}</span>
                  <Link className="btn orange" href={`/operasyonlar/${o.op.ref}#olaylar`}>İşi aç</Link>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">İşe çıkış, gemiye çıkış, başlangıç, bekleme ve bitiş zamanlarını iş sayfasındaki olay düğmeleriyle kaydedin; saatler tahakkukun ve dinlenme hesabının kaynağıdır.</p>
        </div>
        <div className="card">
          <h2>Son 7 gün tamamladıklarım</h2>
          {done.length === 0 ? <div className="empty">Kayıt yok.</div> : (
            <table><thead><tr><th>Zaman</th><th>Gemi / iş</th><th className="num">Süre</th></tr></thead><tbody>
              {done.map((x, i) => { const o = opOf(x.op); return o && <tr key={i}><td className="small">{fmtDT(x.from)}</td><td><Link href={`/operasyonlar/${o.op.ref}`}>{o.vessel}</Link><div className="muted small">{typeName(o.op.typeCode)}</div></td><td className="num">{fmtMin(Math.round((x.to.getTime() - x.from.getTime()) / 60000))}</td></tr>; })}
            </tbody></table>
          )}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Vardiya planım (±7 gün)</h2>
          <table><tbody>{shifts.filter((x) => x.sh.endAt.getTime() >= now - DAY).slice(0, 10).map((x) => (
            <tr key={x.sh.id} className={x === cur ? "hl" : ""}><td className="small">{fmtDT(x.sh.startAt)}</td><td className="small">{fmtTime(x.sh.endAt)}</td><td><span className={`badge ${x.sh.category === "LEAVE" ? "grey" : x.sh.category === "WORK" ? "" : "warn"}`}>{CAT[x.sh.category]}</span></td><td className="small">{x.a?.name ?? ""}</td></tr>
          ))}</tbody></table>
        </div>
        {team.length > 0 && <div className="card">
          <h2>Ekibim ({person.rotationTeam})</h2>
          <table><tbody>{team.map((t) => <tr key={t.id}><td>{t.n.replace("ÖRNEK ", "").split(" · ")[0]}</td><td className="muted small">{t.t}</td></tr>)}</tbody></table>
        </div>}
      </div>
    </>
  );
}
