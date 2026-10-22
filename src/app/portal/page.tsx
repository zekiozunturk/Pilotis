import Link from "next/link";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope } from "@/lib/session";
import { OPERATION_TYPES } from "@/data/catalog";
import { fmtDT, fmtMoney } from "@/lib/format";
import { PortalPlanner } from "./planner";
import { STATUS_SETS } from "@/lib/labels";
const L = (k: string, v: string) => STATUS_SETS.find((x) => x.key === k)!.values[v] ?? v;
import { CartItemControls, SubmitCartForm } from "./cart";

export const metadata = { title: "Müşteri portalı" };

export default async function Portal({ searchParams }: { searchParams: Promise<{ firma?: string; gonderildi?: string }> }) {
  const scope = await currentScope();
  const sp = await searchParams;
  const parties = await db.select().from(s.parties).where(eq(s.parties.kind, "COMPANY")).orderBy(asc(s.parties.legalName));
  const partyId = scope.external ? scope.partyId : sp.firma ?? null;
  const party = parties.find((p) => p.id === partyId) ?? null;

  if (scope.external && !party) {
    return <div className="card"><h1>Müşteri portalı</h1><p className="muted">Hesabınız henüz bir firmaya bağlanmamış. Üst çubuktan firma seçin (geliştirme) veya yöneticinizle iletişime geçin.</p></div>;
  }
  const vessels = await db.select().from(s.vessels).orderBy(asc(s.vessels.name));
  const facilities = await db.select().from(s.facilities).orderBy(asc(s.facilities.name));
  const [cart] = party ? await db.select().from(s.carts).where(and(eq(s.carts.partyId, party.id), eq(s.carts.status, "OPEN"))) : [];
  const items = cart ? await db.select().from(s.cartItems).where(eq(s.cartItems.cartId, cart.id)).orderBy(asc(s.cartItems.createdAt)) : [];
  const myOps = party ? await db.select({ op: s.operations, vessel: s.vessels.name }).from(s.operations)
    .innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .where(or(eq(s.operations.requesterPartyId, party.id), eq(s.operations.billingPartyId, party.id)))
    .orderBy(desc(s.operations.createdAt)).limit(10) : [];
  const hidden: Record<string, string> = scope.external || !party ? {} : { onBehalfPartyId: party.id };
  const vName = (id: string) => vessels.find((v) => v.id === id)?.name ?? "—";
  const fName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "—";

  return (
    <>
      <div className="pagehead">
        <div><h1>Müşteri talep portalı</h1><div className="muted">Gemi → tesis → zaman → beyan → önerilen paketler → sepet → fatura muhatabı → gönderim</div></div>
        {!scope.external && (
          <form style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12 }}>Adına işlem yapılan firma:</span>
            <select name="firma" defaultValue={party?.id ?? ""} style={{ width: 260 }}><option value="">Seçin…</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.legalName}</option>)}</select>
            <button className="btn secondary">Seç</button>
          </form>
        )}
      </div>
      {sp.gonderildi && <div className="alert ok" style={{ marginBottom: 16 }}><span>✓</span><div><b>Talepleriniz alındı</b>
        {sp.gonderildi.split(",").filter(Boolean).map((r) => <Link key={r} className="mono" href={`/operasyonlar/${r}`} style={{ marginRight: 10 }}>{r}</Link>)}
        <div>Talepler planlama ve emniyet değerlendirmesinden sonra kesinleşir; fatura muhatabı onayı ayrıca istenir.</div></div></div>}
      {!party ? <div className="alert info"><span>ⓘ</span><div>Personel olarak bir müşteri firması adına talep oluşturmak için yukarıdan firma seçin. Müşteri hesapları doğrudan kendi firmalarıyla açılır.</div></div> : <>
        <div className="alert info" style={{ marginBottom: 16 }}><span>ⓘ</span><div><b>{party.legalName}</b>Sepete eklemek kaynak rezervasyonu veya operasyon izni değildir. Tahmini bedeller ÖRNEK tarifeyle hesaplanır ve bağlayıcı değildir.</div></div>
        <PortalPlanner vessels={vessels.map((v) => ({ id: v.id, label: `${v.name}${v.gt ? ` · ${Number(v.gt).toLocaleString("tr-TR")} GT` : " · GT bilinmiyor"}`, gt: v.gt, type: v.vesselType }))}
          facilities={facilities.map((f) => ({ id: f.id, label: f.name }))} hidden={hidden} />

        <div className="card" style={{ marginTop: 16 }}>
          <h2>Sepet ({items.length})</h2>
          {items.length === 0 ? <div className="muted">Sepet boş. Paket kartlarından ekleyin.</div> : <>
            <div className="tablewrap" style={{ border: 0 }}>
              <table>
                <thead><tr><th>Gemi</th><th>Hizmet</th><th>Tesis</th><th>İstenen zaman</th><th>Tahmini</th><th>Fatura muhatabı</th><th></th></tr></thead>
                <tbody>{items.map((it) => {
                  const est = it.estimate as { total: string; currency: string } | null;
                  return <tr key={it.id}>
                    <td>{vName(it.vesselId)}</td><td>{OPERATION_TYPES.find((t) => t.code === it.typeCode)?.nameTr}</td><td style={{ fontSize: 12.5 }}>{fName(it.fromFacilityId)} → {fName(it.toFacilityId)}</td>
                    <td>{fmtDT(it.plannedStart)}</td><td>{est?.total ? fmtMoney(est.total, est.currency) : "İnceleme"}</td>
                    <td colSpan={2}><CartItemControls itemId={it.id} billingPartyId={it.billingPartyId} parties={parties.map((p) => ({ id: p.id, label: p.legalName }))} hidden={hidden} /></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {items.some((i) => !i.billingPartyId) && <div className="alert warn" style={{ marginTop: 10 }}><span>⚠</span><div>Bazı kalemlerde fatura muhatabı seçilmedi. Talep gönderilebilir ancak planlama öncesinde muhatap belirlenip onaylanmalıdır (R-018).</div></div>}
            <div style={{ marginTop: 12 }}><SubmitCartForm hidden={hidden} count={items.length} /></div>
          </>}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h2>Taleplerim</h2>
          <table><thead><tr><th>Operasyon</th><th>Gemi</th><th>Plan</th><th>Talep</th><th>Onay</th></tr></thead><tbody>
            {myOps.map(({ op, vessel }) => <tr key={op.id}><td><Link className="mono" href={`/operasyonlar/${op.ref}`}>{op.ref}</Link></td><td>{vessel}</td><td>{fmtDT(op.plannedStart)}</td><td><span className="badge grey">{L("requestStatus", op.requestStatus)}</span></td><td><span className={`badge ${op.approvalStatus === "AWAITING_BILLING_PARTY" ? "warn" : "grey"}`}>{L("approvalStatus", op.approvalStatus)}</span></td></tr>)}
            {myOps.length === 0 && <tr><td colSpan={5} className="muted">Henüz talep yok.</td></tr>}
          </tbody></table>
        </div>
      </>}
    </>
  );
}
