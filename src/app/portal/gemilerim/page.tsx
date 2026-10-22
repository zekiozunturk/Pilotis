import Link from "next/link";
import { asc, eq, inArray, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope } from "@/lib/session";
import { VesselForm } from "@/app/gemiler/form";
import { fmtNum } from "@/lib/format";

export const metadata = { title: "Gemilerim" };
export const dynamic = "force-dynamic";
export default async function Gemilerim() {
  const scope = await currentScope();
  if (!scope.partyId && scope.external) return <div className="card"><h1>Gemilerim</h1><p className="muted">Hesabınız bir firmaya bağlı değil.</p></div>;
  const pid = scope.partyId ?? "__none__";
  const opV = await db.select({ v: s.portCalls.vesselId }).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).where(or(eq(s.operations.requesterPartyId, pid), eq(s.operations.billingPartyId, pid)));
  const cartV = await db.select({ v: s.cartItems.vesselId }).from(s.cartItems).innerJoin(s.carts, eq(s.carts.id, s.cartItems.cartId)).where(eq(s.carts.partyId, pid));
  const ids = [...new Set([...opV, ...cartV].map((x) => x.v))];
  const mine = ids.length ? await db.select().from(s.vessels).where(inArray(s.vessels.id, ids)).orderBy(asc(s.vessels.name)) : [];
  return (
    <>
      <div className="pagehead"><div><h1>Gemilerim</h1><div className="muted">Talep geçmişinizdeki gemiler. Listede olmayan gemiyi ekleyin; IMO numarası denetim hanesiyle doğrulanır ve aynı IMO ikinci kez açılamaz.</div></div><Link className="btn orange" href="/portal">Talep oluştur</Link></div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Talep verdiğim gemiler ({mine.length})</h2>
          {mine.length === 0 ? <div className="empty">Henüz talep yok. Yeni gemi ekleyip talep oluşturabilirsiniz.</div> : (
            <table><thead><tr><th>Gemi</th><th>IMO</th><th>Bayrak</th><th>Tip</th><th className="num">GT</th></tr></thead><tbody>
              {mine.map((v) => <tr key={v.id}><td><b>{v.name}</b></td><td className="mono">{v.imo ?? "—"}</td><td>{v.flag ?? "—"}</td><td className="small">{v.vesselType ?? "—"}</td><td className="num">{v.gt ? fmtNum(v.gt) : <span className="badge warn">bilinmiyor</span>}</td></tr>)}
            </tbody></table>
          )}
          <p className="muted small">GT değeri fiyatın temelidir; bilinmiyorsa boş bırakın (sıfır yazmayın). Saha tespiti farklı çıkarsa bedel tespit edilen değerle hesaplanır.</p>
        </div>
        <div className="card" id="yeni"><h2>Yeni gemi ekle</h2><VesselForm /></div>
      </div>
    </>
  );
}
