import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { SERVICE_LABELS } from "@/data/catalog";

export const metadata = { title: "Hizmet kataloğu" };

export default async function Catalog() {
  const rows = await db.select().from(s.operationTypes).orderBy(asc(s.operationTypes.code));
  return (
    <>
      <div className="pagehead"><div><h1>Hizmet / operasyon kataloğu</h1><div className="muted">İşletme kataloğu kodlarıdır; mevzuattaki hizmet adlarıyla ayrıca eşleştirilir. Bir operasyon birden fazla hizmet satırı üretir.</div></div></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Kod</th><th>Operasyon</th><th>English</th><th>Hizmet bileşenleri</th><th>Tarife aileleri</th><th>Ölçü</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.code}><td className="mono">{r.code}</td><td><b>{r.nameTr}</b></td><td className="muted">{r.nameEn}</td>
              <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{r.serviceKinds.map((k) => <span key={k} className="badge">{SERVICE_LABELS[k]}</span>)}</td>
              <td>{r.tariffFamilies.join(", ")}</td><td>{r.unit}</td></tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
