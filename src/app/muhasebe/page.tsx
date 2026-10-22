import Link from "next/link";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, requireInternalPage } from "@/lib/session";
import { fmtDT, fmtMoney } from "@/lib/format";
import { STATUS_SETS } from "@/lib/labels";

export const metadata = { title: "Muhasebe masası" };
export const dynamic = "force-dynamic";
const ACC = STATUS_SETS.find((x) => x.key === "accrualStatus")!.values;
const tl = (n: number) => fmtMoney(n.toFixed(2), "TRY");

export default async function Muhasebe() {
  await requireInternalPage();
  const role = await currentRole();
  if (!["ACCOUNTING", "SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER", "AUDITOR"].includes(role)) {
    return <div className="card"><h1>Muhasebe masası</h1><p className="muted">Bu ekran muhasebe yetkisi gerektirir.</p></div>;
  }
  const opRow = { op: s.operations, vessel: s.vessels.name, party: s.parties.legalName };
  const base = () => db.select(opRow).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId)).leftJoin(s.parties, eq(s.parties.id, s.operations.billingPartyId));
  const awaitingAccrual = await base().where(and(inArray(s.operations.opStatus, ["COMPLETED", "PARTIAL"]), notInArray(s.operations.accrualStatus, ["APPROVED", "CORRECTED"]))).orderBy(asc(s.operations.plannedStart)).limit(50);
  const awaitingExport = await base().where(and(inArray(s.operations.accrualStatus, ["APPROVED", "CORRECTED"]), eq(s.operations.accountingStatus, "AWAITING_EXPORT"))).orderBy(asc(s.operations.plannedStart)).limit(50);
  // Açık alacak: fatura toplamı − eşleşen tahsilat
  const open = (await db.execute(sql`
    SELECT i.id, i.number, i.issue_date, p.legal_name, (i.net_amount + i.tax_amount)::float AS total, coalesce(sum(m.amount), 0)::float AS paid, i.disputed_amount::float AS disputed
    FROM invoices i JOIN parties p ON p.id = i.party_id LEFT JOIN payment_matches m ON m.invoice_id = i.id
    WHERE i.status = 'ISSUED' AND i.kind = 'INVOICE' GROUP BY i.id, p.legal_name HAVING (i.net_amount + i.tax_amount) - coalesce(sum(m.amount), 0) > 0.009
    ORDER BY i.issue_date`)).rows as { id: string; number: string; issue_date: string; legal_name: string; total: number; paid: number; disputed: number }[];
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const age = (d: string) => Math.floor((Date.parse(today) - Date.parse(d)) / 864e5);
  const buckets = [["0–30 gün", 0, 30], ["31–60", 31, 60], ["61–90", 61, 90], ["90+", 91, 1e9]] as const;
  const bk = buckets.map(([l, a, b]) => ({ l, v: open.filter((o) => age(o.issue_date) >= a && age(o.issue_date) <= b).reduce((x, o) => x + o.total - o.paid, 0) }));
  const totalOpen = open.reduce((x, o) => x + o.total - o.paid, 0);
  const unmatched = (await db.execute(sql`
    SELECT pay.id, pay.received_date, pay.reference, p.legal_name, pay.amount::float AS amount, coalesce(sum(m.amount), 0)::float AS used
    FROM payments pay JOIN parties p ON p.id = pay.party_id LEFT JOIN payment_matches m ON m.payment_id = pay.id
    GROUP BY pay.id, p.legal_name HAVING pay.amount - coalesce(sum(m.amount), 0) > 0.009 ORDER BY pay.received_date`)).rows as { id: string; received_date: string; reference: string | null; legal_name: string; amount: number; used: number }[];
  const disputed = open.filter((o) => o.disputed > 0);
  const fx = await db.select().from(s.exchangeRates).orderBy(desc(s.exchangeRates.bulletinDate)).limit(6);
  const lastFx = (c: string) => fx.find((r) => r.currency === c);
  return (
    <>
      <div className="pagehead">
        <div><h1>Muhasebe masası</h1><div className="muted">Tahakkuk → muhasebe aktarımı → fatura → tahsilat. Faturalar TL kesilir; döviz kalemleri iş bitiş günü TCMB döviz satış kuruyla çevrilir.</div></div>
        <div className="toolbar">
          <Link className="btn orange" href="/aktarim?varlik=faturalar">Faturaları Excel'den al</Link>
          <Link className="btn secondary" href="/aktarim?varlik=tahsilatlar">Tahsilatları al</Link>
          <Link className="btn secondary" href="/analiz/finans">Finans analizi</Link>
          <Link className="btn secondary" href="/kurlar">Kurlar</Link>
        </div>
      </div>
      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="tile"><div className="l">Kapanmış, tahakkuku onaysız</div><div className="v">{awaitingAccrual.length}</div><div className="d">iş emri</div></div>
        <div className="tile"><div className="l">Tahakkuku onaylı, aktarılmamış</div><div className="v">{awaitingExport.length}</div><div className="d">ETA'ya aktarım bekliyor</div></div>
        <div className="tile"><div className="l">Açık alacak</div><div className="v">{tl(totalOpen)}</div><div className="d">{open.length} fatura</div></div>
        <div className="tile"><div className="l">Eşleşmemiş tahsilat</div><div className="v">{tl(unmatched.reduce((x, u) => x + u.amount - u.used, 0))}</div><div className="d">{unmatched.length} kayıt</div></div>
        <div className="tile"><div className="l">TCMB döviz satış</div><div className="v" style={{ fontSize: 16 }}>{["USD", "EUR"].map((c) => { const r = lastFx(c); return <div key={c}>{c} {r?.forexSelling ? Number(r.forexSelling).toLocaleString("tr-TR", { minimumFractionDigits: 4 }) : "—"}</div>; })}</div><div className="d">{lastFx("USD")?.bulletinDate ?? "kur girilmemiş"}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Alacak yaşlandırma</h2>
        <div className="aging">{bk.map((b) => <div key={b.l}><div className="l">{b.l}</div><div className="v">{tl(b.v)}</div></div>)}<div><div className="l">İtirazlı</div><div className="v">{tl(disputed.reduce((x, o) => x + o.disputed, 0))}</div></div></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Tahakkuk bekleyen işler</h2>
          {awaitingAccrual.length === 0 ? <div className="empty">Bekleyen yok.</div> : <table><thead><tr><th>İş emri</th><th>Gemi</th><th>Muhatap</th><th>Durum</th></tr></thead><tbody>
            {awaitingAccrual.slice(0, 15).map((o) => <tr key={o.op.id}><td><Link className="mono" href={`/operasyonlar/${o.op.ref}`}>{o.op.ref}</Link><div className="muted small">{fmtDT(o.op.plannedStart)}</div></td><td>{o.vessel}</td><td className="small">{o.party ?? <span className="badge warn">Belirlenmedi</span>}</td><td><span className="badge grey">{ACC[o.op.accrualStatus]}</span></td></tr>)}
          </tbody></table>}
        </div>
        <div className="card">
          <h2>Muhasebeye aktarılacak</h2>
          {awaitingExport.length === 0 ? <div className="empty">Aktarılacak tahakkuk yok.</div> : <table><thead><tr><th>İş emri</th><th>Gemi</th><th>Muhatap</th></tr></thead><tbody>
            {awaitingExport.slice(0, 15).map((o) => <tr key={o.op.id}><td><Link className="mono" href={`/operasyonlar/${o.op.ref}`}>{o.op.ref}</Link></td><td>{o.vessel}</td><td className="small">{o.party ?? "—"}</td></tr>)}
          </tbody></table>}
          <p className="muted small">ETA muhasebe aktarım dosyası sonraki aşamada eklenecek; şimdilik iş emrinden tahakkuk dökümü ve Excel çıktısı kullanılır.</p>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Açık faturalar</h2>
          <table><thead><tr><th>Fatura</th><th>Cari</th><th className="num">Kalan</th><th className="num">Gün</th></tr></thead><tbody>
            {open.slice().sort((a, b) => age(b.issue_date) - age(a.issue_date)).slice(0, 15).map((o) => <tr key={o.id}><td className="mono small">{o.number}<div className="muted">{o.issue_date.split("-").reverse().join(".")}</div></td><td className="small">{o.legal_name}{o.disputed > 0 && <> <span className="badge warn">itirazlı</span></>}</td><td className="num">{tl(o.total - o.paid)}</td><td className={`num ${age(o.issue_date) > 60 ? "bad" : ""}`}>{age(o.issue_date)}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Eşleşmemiş tahsilatlar</h2>
          {unmatched.length === 0 ? <div className="empty">Hepsi eşleşmiş.</div> : <table><thead><tr><th>Tarih</th><th>Cari</th><th>Referans</th><th className="num">Açıkta</th></tr></thead><tbody>
            {unmatched.map((u) => <tr key={u.id}><td className="small">{u.received_date.split("-").reverse().join(".")}</td><td className="small">{u.legal_name}</td><td className="mono small">{u.reference ?? "—"}</td><td className="num">{tl(u.amount - u.used)}</td></tr>)}
          </tbody></table>}
          <p className="muted small">Eşleşmeyen tahsilat hiçbir işe veya kişiye yazılmaz; fatura numarasıyla eşleştirin.</p>
        </div>
      </div>
    </>
  );
}
