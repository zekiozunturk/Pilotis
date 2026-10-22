import Link from "next/link";
import { redirect } from "next/navigation";
import { currentScope } from "@/lib/session";
import { dashboardData } from "@/lib/ops";
import { STATUS_SETS } from "@/lib/labels";
import { STATUS_LABELS, OPERATOR } from "@/data/catalog";
import { fmtDT } from "@/lib/format";

export const metadata = { title: "Kokpit" };

const opLabel = STATUS_SETS.find((x) => x.key === "opStatus")!.values;
const accLabel = STATUS_SETS.find((x) => x.key === "accrualStatus")!.values;

export default async function Home() {
  if ((await currentScope()).external) redirect("/portal");
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

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Link href="/operasyonlar" className="card kpi"><div className="v">{open.length}</div><div className="l">Açık iş emri</div></Link>
        <Link href="/operasyonlar" className="card kpi accent"><div className="v">{active.length}</div><div className="l">Devam eden operasyon</div></Link>
        <Link href="/filo" className="card kpi"><div className="v">{tugs.filter((t) => t.available).length}/{tugs.length}</div><div className="l">Kullanılabilir römorkör</div></Link>
        <Link href="/operasyonlar" className="card kpi accent"><div className="v">{closedNoAccrual.length}</div><div className="l">Kapanmış, tahakkuku onaysız</div></Link>
      </div>

      {noBilling.length > 0 && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          <span aria-hidden>⚠</span>
          <div><b>Fatura muhatabı belirlenmemiş {noBilling.length} iş var</b>
            Talep eden taraf otomatik olarak fatura muhatabı sayılmaz (R-018). {noBilling.map((o) => <Link key={o.op.id} href={`/operasyonlar/${o.op.ref}`} style={{ marginRight: 8 }}>{o.op.ref}</Link>)}
          </div>
        </div>
      )}

      <div className="grid g3">
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h2>Son iş emirleri</h2>
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
                {ops.length === 0 && <tr><td colSpan={6} className="muted">Henüz iş emri yok. <Link href="/operasyonlar/yeni">İlk talebi oluşturun.</Link></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <h2>Kural kataloğu</h2>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--navy-800)" }}>{prodRules}<span className="muted" style={{ fontSize: 14 }}> / {rules.length} onaylı</span></div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Onaysız kurala dayanan hesap üretim tahakkuku oluşturamaz.</div>
            {Object.entries(byStatus).map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{STATUS_LABELS[k]}</span><b>{v}</b></div>)}
            <div style={{ marginTop: 10 }}><Link href="/kurallar">Kataloğu aç →</Link></div>
          </div>
          <div className="card">
            <h2>İşletmeden beklenen</h2>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--orange)" }}>{issues.length}<span className="muted" style={{ fontSize: 14 }}> açık konu</span></div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
              {issues.slice(0, 4).map((i) => <li key={i.code}><span className="mono">{i.code}</span> {i.topic}</li>)}
            </ul>
            <div style={{ marginTop: 10 }}><Link href="/acik-konular">Tümü →</Link></div>
          </div>
        </div>
      </div>
    </>
  );
}
