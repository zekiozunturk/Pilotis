import { requireInternalPage } from "@/lib/session";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { STATUS_LABELS, LABEL_LABELS } from "@/data/catalog";

export const metadata = { title: "Mevzuat / kurallar" };
const tone = (st: string) => (st === "APPROVED" || st === "IN_FORCE" ? "ok" : st === "DRAFT" ? "grey" : "warn");

export default async function Rules() {
  await requireInternalPage();
  const rows = await db.select().from(s.businessRules).orderBy(asc(s.businessRules.code));
  const sources = await db.select().from(s.regulationSources);
  return (
    <>
      <div className="pagehead"><div><h1>Mevzuat ve kural kataloğu</h1><div className="muted">Taslak → Kaynak bulundu → Uzman kontrolünde → Onaylı → Yürürlükte → Yürürlükten kalktı</div></div></div>
      <div className="tablewrap" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Kod</th><th>Kural</th><th>Etiket</th><th>Dayanak</th><th>Modüller</th><th>Statü</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.code}><td className="mono">{r.code}</td><td>{r.title}</td><td><span className="badge grey">{LABEL_LABELS[r.label]}</span></td><td style={{ fontSize: 12.5 }}>{r.basis}</td>
              <td style={{ fontSize: 12.5 }}>{r.modules.join(", ")}</td><td><span className={`badge ${tone(r.status)}`}>{STATUS_LABELS[r.status]}</span></td></tr>))}
          </tbody>
        </table>
      </div>
      <h2>Kaynak belgeler</h2>
      {sources.map((x) => <div className="card" key={x.id}><b>{x.title}</b><div className="muted">{x.issuer}</div>{x.officialUrl && <a href={x.officialUrl} target="_blank" rel="noreferrer">{x.officialUrl}</a>}<div className="badge warn" style={{ marginTop: 6 }}>Resmî nüsha ile karşılaştırma bekleniyor (AK-08)</div></div>)}
    </>
  );
}
