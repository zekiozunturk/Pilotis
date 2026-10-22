import Link from "next/link";
import { redirect } from "next/navigation";
import { currentScope } from "@/lib/session";
import { dashboardData } from "@/lib/ops";
import { STATUS_SETS } from "@/lib/labels";
import { STATUS_LABELS, OPERATOR } from "@/data/catalog";
import { fmtDT } from "@/lib/format";
import { Board } from "@/components/Board";
import { db, schema as sc } from "@/db";
import { and, lte, gt, eq } from "drizzle-orm";

export const metadata = { title: "Kokpit" };

const opLabel = STATUS_SETS.find((x) => x.key === "opStatus")!.values;
const accLabel = STATUS_SETS.find((x) => x.key === "accrualStatus")!.values;

export default async function Home() {
  const scope = await currentScope();
  if (scope.external) redirect("/portal");
  if (["PILOT", "TUG_MASTER", "CREW"].includes(scope.role)) redirect("/saha");
  const now = new Date();
  const onDuty = await db.select({ s: sc.shifts, p: sc.personnel, a: sc.fleetAssets }).from(sc.shifts).innerJoin(sc.personnel, eq(sc.personnel.id, sc.shifts.personnelId)).innerJoin(sc.fleetAssets, eq(sc.fleetAssets.id, sc.shifts.assetId))
    .where(and(eq(sc.shifts.category, "WORK"), lte(sc.shifts.startAt, now), gt(sc.shifts.endAt, now)));
  const duty = [...new Map(onDuty.map((x) => [x.a.id, x])).values()].sort((x, y) => (x.a.code ?? "").localeCompare(y.a.code ?? "", "tr", { numeric: true }));
  const { ops, fleet, rules, issues } = await dashboardData();
  const active = ops.filter((o) => ["TRANSIT", "ON_SITE", "STARTED", "PAUSED"].includes(o.op.opStatus));
  const open = ops.filter((o) => !["COMPLETED", "CANCELLED", "PARTIAL"].includes(o.op.opStatus));
  const noBilling = ops.filter((o) => !o.op.billingPartyId);
  const closedNoAccrual = ops.filter((o) => ["COMPLETED", "PARTIAL"].includes(o.op.opStatus) && o.op.accrualStatus !== "APPROVED");
  const tugs = fleet.filter((f) => f.type === "TUG");
  const prodRules = rules.filter((r) => ["APPROVED", "IN_FORCE"].includes(r.status)).length;
  const byStatus = rules.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Operasyon Kokpiti</h1>
          <div className="muted">{OPERATOR.legalName} · Yalova Hizmet Sahası · {OPERATOR.motto}</div>
        </div>
        <div className="toolbar">
          <Link className="btn orange" href="/operasyonlar/yeni">+ Yeni talep</Link>
          <Link className="btn secondary" href="/tarife">Hesap simülatörü</Link>
        </div>
      </div>

      {noBilling.length > 0 && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          <span aria-hidden>⚠</span>
          <div><b>Fatura muhatabı belirlenmemiş {noBilling.length} iş var</b>
            Talep eden taraf otomatik olarak fatura muhatabı sayılmaz (R-018). {noBilling.map((o) => <Link key={o.op.id} href={`/operasyonlar/${o.op.ref}`} style={{ marginRight: 8 }}>{o.op.ref}</Link>)}
          </div>
        </div>
      )}
      <Board storageKey={`pilotis.board.kokpit.${scope.role}`} cards={[
        { id: "k-open", title: "Açık iş emri", kind: "kpi", node: <Link href="/operasyonlar" className="card kpi" style={{ display: "block" }}><div className="v">{open.length}</div><div className="l">Açık iş emri</div></Link> },
        { id: "k-active", title: "Devam eden operasyon", kind: "kpi", node: <Link href="/operasyonlar" className="card kpi accent" style={{ display: "block" }}><div className="v">{active.length}</div><div className="l">Devam eden operasyon</div></Link> },
        { id: "k-tugs", title: "Kullanılabilir römorkör", kind: "kpi", node: <Link href="/filo" className="card kpi" style={{ display: "block" }}><div className="v">{tugs.filter((t) => t.available).length}/{tugs.length}</div><div className="l">Kullanılabilir römorkör</div></Link> },
        { id: "k-accrual", title: "Tahakkuku onaysız", kind: "kpi", node: <Link href="/analiz/finans" className="card kpi accent" style={{ display: "block" }}><div className="v">{closedNoAccrual.length}</div><div className="l">Kapanmış, tahakkuku onaysız</div></Link> },
        { id: "p-recent", title: "Son iş emirleri", span: 3, node: (
          <div className="card">
            <div className="tablewrap" style={{ border: 0 }}>
              <table>
                <thead><tr><th>Operasyon</th><th>Gemi</th><th>Tür</th><th>Plan</th><th>Operasyon</th><th>Tahakkuk</th></tr></thead>
                <tbody>
                  {ops.slice(0, 8).map(({ op, vessel, type }) => (
                    <tr key={op.id}>
                      <td><Link className="mono" href={`/operasyonlar/${op.ref}`}>{op.ref}</Link> {op.isDemo && <span className="badge demo">ÖRNEK</span>}</td>
                      <td>{vessel}</td><td>{type}</td><td>{fmtDT(op.plannedStart)}</td>
                      <td><span className="badge">{opLabel[op.opStatus]}</span></td>
                      <td><span className={`badge ${op.accrualStatus === "APPROVED" ? "ok" : "grey"}`}>{accLabel[op.accrualStatus]}</span></td>
                    </tr>
                  ))}
                  {ops.length === 0 && <tr><td colSpan={6}><div className="empty">Henüz iş emri yok. <Link href="/operasyonlar/yeni">İlk talebi oluşturun.</Link></div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>) },
        { id: "p-duty", title: "Şu an görevdeki ekipler", node: (
          <div className="card">
            {duty.length ? <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 13, display: "grid", gap: 4 }}>{duty.map((d) => <li key={d.a.id} style={{ display: "flex", justifyContent: "space-between" }}><span><b>{d.a.code}</b> · {d.p.rotationTeam ?? "—"}</span><span className="muted">{fmtDT(d.s.endAt)}'e kadar</span></li>)}</ul> : <div className="empty">Şu an görevli römorkör ekibi yok</div>}
            <div style={{ marginTop: 8 }}><Link href="/planlama">Planlama →</Link></div>
          </div>) },
        { id: "p-rules", title: "Kural kataloğu", node: (
          <div className="card">
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--navy-800)" }}>{prodRules}<span className="muted" style={{ fontSize: 14 }}> / {rules.length} onaylı</span></div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Onaysız kurala dayanan hesap üretim tahakkuku oluşturamaz.</div>
            {Object.entries(byStatus).map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{STATUS_LABELS[k]}</span><b>{v}</b></div>)}
            <div style={{ marginTop: 10 }}><Link href="/kurallar">Kataloğu aç →</Link></div>
          </div>) },
        { id: "p-issues", title: "İşletmeden beklenen", span: 2, node: (
          <div className="card">
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--orange)" }}>{issues.length}<span className="muted" style={{ fontSize: 14 }}> açık konu</span></div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
              {issues.slice(0, 4).map((i) => <li key={i.code}><span className="mono">{i.code}</span> {i.topic}</li>)}
            </ul>
            <div style={{ marginTop: 10 }}><Link href="/acik-konular">Tümü →</Link></div>
          </div>) },
        { id: "p-analysis", title: "Analiz merkezi", node: (
          <div className="card">
            <div style={{ fontSize: 13 }}>Personel, römorkör, mesai, fatura ve emniyet göstergeleri tek yerde.</div>
            <div className="toolbar" style={{ marginTop: 8 }}><Link className="btn secondary" href="/analiz">Yönetici özeti</Link><Link className="btn secondary" href="/analiz/rapor">Rapor oluştur</Link></div>
          </div>) },
      ]} />
    </>
  );
}
