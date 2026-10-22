import { DataToolbar } from "@/components/DataToolbar";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { fmtNum } from "@/lib/format";
import { VesselForm } from "./form";

export const metadata = { title: "Gemiler" };

export default async function Vessels() {
  const rows = await db.select().from(s.vessels).orderBy(asc(s.vessels.name));
  return (
    <>
      <div className="pagehead"><div><h1>Gemiler</h1><div className="muted">GT, NT ve DWT ayrı alanlardır; bilinmeyen değer boş kalır, sıfır kabul edilmez.</div></div><DataToolbar entity="gemiler" newHref="#yeni-gemi" reportHref="/analiz/rapor" /></div>
      <div className="grid g3">
        <div className="tablewrap" style={{ gridColumn: "span 2", alignSelf: "start" }}>
          <table>
            <thead><tr><th>Gemi</th><th>IMO / kimlik</th><th>Bayrak</th><th>Tip</th><th>GT</th><th>NT</th><th>DWT</th><th>LOA</th></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.id}><td><b>{v.name}</b> {v.isDemo && <span className="badge demo">ÖRNEK</span>}</td><td className="mono">{v.imo ?? v.altOfficialId ?? "—"}</td><td>{v.flag ?? "—"}</td><td>{v.vesselType ?? "—"}</td>
                <td>{v.gt ? fmtNum(v.gt) : <span className="badge warn">Bilinmiyor</span>}</td><td>{fmtNum(v.nt)}</td><td>{fmtNum(v.dwt)}</td><td>{v.loa ? `${fmtNum(v.loa, 1)} m` : "—"}</td></tr>))}
            </tbody>
          </table>
        </div>
        <div className="card" id="yeni-gemi" style={{ alignSelf: "start" }}><h2>Yeni gemi kartı</h2><VesselForm /></div>
      </div>
    </>
  );
}
