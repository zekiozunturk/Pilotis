import { requireInternalPage } from "@/lib/session";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";

export const metadata = { title: "Açık konular" };

export default async function Issues() {
  await requireInternalPage();
  const rows = await db.select().from(s.openIssues).orderBy(asc(s.openIssues.code));
  return (
    <>
      <div className="pagehead"><div><h1>Açık konular</h1><div className="muted">Canlı kullanım öncesi işletmeden beklenen veriler. Geliştirme örnek verilerle sürer; örnekler üretim tahakkukuna giremez.</div></div></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Kod</th><th>Konu</th><th>Sorumlu</th><th>İstenecek belge</th><th>Hedef</th><th>Modül</th><th>Durum</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.code}><td className="mono">{r.code}</td><td><b>{r.topic}</b></td><td>{r.owner}</td><td>{r.document}</td><td>{r.target}</td><td>{r.module}</td>
              <td><span className={`badge ${r.closed ? "ok" : "warn"}`}>{r.closed ? "Kapandı" : "Açık"}</span></td></tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
