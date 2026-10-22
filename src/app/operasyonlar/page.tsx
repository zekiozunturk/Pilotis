import Link from "next/link";
import { db, schema as s } from "@/db";
import { desc, eq } from "drizzle-orm";
import { STATUS_SETS } from "@/lib/labels";
import { fmtDT } from "@/lib/format";

export const metadata = { title: "Operasyonlar" };

export default async function Operations() {
  const rows = await db.select({ op: s.operations, vessel: s.vessels.name, gt: s.vessels.gt, type: s.operationTypes.nameTr, billing: s.parties.legalName })
    .from(s.operations)
    .innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId))
    .innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .innerJoin(s.operationTypes, eq(s.operationTypes.code, s.operations.typeCode))
    .leftJoin(s.parties, eq(s.parties.id, s.operations.billingPartyId))
    .orderBy(desc(s.operations.createdAt));
  return (
    <>
      <div className="pagehead">
        <div><h1>Operasyonlar</h1><div className="muted">Her iş tekil operasyon kimliğiyle izlenir; durumlar bağımsız kümelerdir.</div></div>
        <Link className="btn orange" href="/operasyonlar/yeni">+ Yeni talep</Link>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Operasyon</th><th>Gemi</th><th>Tür</th><th>Planlanan</th><th>Fatura muhatabı</th>
            {STATUS_SETS.slice(0, 5).map((x) => <th key={x.key}>{x.label}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ op, vessel, type, billing }) => (
              <tr key={op.id}>
                <td><Link className="mono" href={`/operasyonlar/${op.ref}`}>{op.ref}</Link>{op.isDemo && <> <span className="badge demo">ÖRNEK</span></>}</td>
                <td>{vessel}</td><td>{type}</td><td>{fmtDT(op.plannedStart)}</td>
                <td>{billing ?? <span className="badge warn">Belirlenmedi</span>}</td>
                {STATUS_SETS.slice(0, 5).map((x) => <td key={x.key}><span className="badge grey">{x.values[(op as Record<string, unknown>)[x.key] as string]}</span></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
