import { requireInternalPage } from "@/lib/session";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { SERVICE_LABELS } from "@/data/catalog";
import { Term } from "@/components/Term";
const OP_TERM: Record<string, number> = { "OP-001": 8, "OP-002": 9, "OP-003": 10, "OP-008": 11, "OP-009": 12, "OP-010": 18, "OP-011": 20, "OP-012": 19, "OP-016": 43, "OP-017": 5, "OP-018": 5 };
const SVC_TERM: Record<string, number> = { PILOTAGE: 1, TOWAGE: 3, MOORING: 5, UNMOORING: 5, STANDBY_TUG: 19 };

export const metadata = { title: "Hizmet kataloğu" };

export default async function Catalog() {
  await requireInternalPage();
  const rows = await db.select().from(s.operationTypes).orderBy(asc(s.operationTypes.code));
  return (
    <>
      <div className="pagehead"><div><h1>Hizmet / operasyon kataloğu</h1><div className="muted">İşletme kataloğu kodlarıdır; mevzuattaki hizmet adlarıyla ayrıca eşleştirilir. Bir operasyon birden fazla hizmet satırı üretir.</div></div></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Kod</th><th>Operasyon</th><th>English</th><th>Hizmet bileşenleri</th><th>Tarife aileleri</th><th>Ölçü</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.code}><td className="mono">{r.code}</td><td><b>{OP_TERM[r.code] ? <Term n={OP_TERM[r.code]}>{r.nameTr}</Term> : r.nameTr}</b></td><td className="muted">{r.nameEn}</td>
              <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{r.serviceKinds.map((k) => <span key={k} className="badge">{SVC_TERM[k] ? <Term n={SVC_TERM[k]}>{SERVICE_LABELS[k]}</Term> : SERVICE_LABELS[k]}</span>)}</td>
              <td>{r.tariffFamilies.join(", ")}</td><td>{r.unit}</td></tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
