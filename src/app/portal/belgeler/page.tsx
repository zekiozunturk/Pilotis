import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope, currentUser } from "@/lib/session";
import { contractStatus, textHash } from "@/lib/contracts";
import { REQUIRED_FOR_REQUESTS, type ContractCode } from "@/data/contracts";
import { ContractText } from "@/components/ContractText";
import { fmtDT } from "@/lib/format";
import { OPERATION_TYPES } from "@/data/catalog";
import { AcceptForm } from "./accept-form";
import { BillingDecisionForm } from "@/app/operasyonlar/[ref]/forms";

export const metadata = { title: "Sözleşme ve onaylar" };
export const dynamic = "force-dynamic";
const ORDER: ContractCode[] = ["HIZMET_SOZLESMESI", "ODEME_TAAHHUDU", "BEYAN_TAAHHUDU", "KVKK_AYDINLATMA"];
const KIND: Record<string, string> = { HIZMET_SOZLESMESI: "Bir kez, firma adına", ODEME_TAAHHUDU: "Bir kez, firma adına", BEYAN_TAAHHUDU: "Her talepte, gönderim sırasında", KVKK_AYDINLATMA: "Bilgilendirme — kayıtta okundu" };
const METHOD: Record<string, string> = { CLICKWRAP: "Elektronik onay", DRAWN: "Çizilmiş imza", E_SIGNATURE: "e-İmza", WET_UPLOADED: "Islak imza (taranmış)" };

export default async function Belgeler() {
  const scope = await currentScope();
  const user = await currentUser();
  if (!scope.external || !scope.partyId) return <div className="card"><h1>Sözleşme ve onaylar</h1><p className="muted">Bu sayfa müşteri firma hesapları içindir. Personel, firmaların onay durumunu taraf kartından ve iş emrinden görür.</p></div>;
  const [party] = await db.select().from(s.parties).where(eq(s.parties.id, scope.partyId));
  const status = (await contractStatus(scope.partyId)).sort((a, b) => ORDER.indexOf(a.template.code as ContractCode) - ORDER.indexOf(b.template.code as ContractCode));
  // Fatura muhatabı olarak onay bekleyen işler
  const ops = await db.select({ op: s.operations, vessel: s.vessels.name }).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .where(and(eq(s.operations.billingPartyId, scope.partyId))).orderBy(desc(s.operations.createdAt)).limit(40);
  const waiting = ops.filter((o) => o.op.approvalStatus === "AWAITING_BILLING_PARTY");
  const docs = ops.length ? await db.select().from(s.documentVersions).where(and(inArray(s.documentVersions.operationId, ops.map((o) => o.op.id)), inArray(s.documentVersions.docType, ["TALEPNAME", "TAAHHUTNAME", "BEYAN_FORMU"]))).orderBy(desc(s.documentVersions.version)) : [];
  const decided = ops.length ? await db.select().from(s.billingApprovals).where(inArray(s.billingApprovals.operationId, ops.map((o) => o.op.id))) : [];
  const signer = { name: user?.name ?? "", title: user?.title ?? "" };
  return (
    <>
      <div className="pagehead"><div><h1>Sözleşme ve onaylar</h1><div className="muted">{party.legalName} · Dijital olarak okuyup onayladığınız metinler ve onayınızı bekleyen iş belgeleri. Onaylar ad, unvan, zaman, cihaz ve metin özetiyle saklanır.</div></div></div>
      <div className="tiles" style={{ marginBottom: 16 }}>
        {status.map(({ template: t, acceptance: a }) => (
          <a key={t.id} href={`#${t.code}`} className="tile">
            <div className="l">{t.title}</div>
            <div className="v" style={{ fontSize: 16 }}>{a ? <span className="badge ok">✓ Onaylandı</span> : t.code === "BEYAN_TAAHHUDU" ? <span className="badge">Talepte onaylanır</span> : <span className="badge warn">Onay bekliyor</span>}</div>
            <div className="d">{a ? `${fmtDT(a.acceptedAt)} · ${a.signerName}` : KIND[t.code]}</div>
          </a>
        ))}
      </div>

      <div className="card" id="isler" style={{ marginBottom: 16 }}>
        <h2>Fatura muhatabı onayınızı bekleyen işler ({waiting.length})</h2>
        {waiting.length === 0 ? <div className="empty">Bekleyen iş yok.</div> : waiting.map(({ op, vessel }) => {
          const d = docs.filter((x) => x.operationId === op.id);
          return (
            <details key={op.id} className="approve" open={waiting.length <= 2}>
              <summary><b className="mono">{op.ref}</b> · {vessel} · {OPERATION_TYPES.find((t) => t.code === op.typeCode)?.nameTr} · {fmtDT(op.plannedStart)}</summary>
              <div className="toolbar" style={{ margin: "8px 0" }}>
                {d.length === 0 ? <span className="muted small">Belge henüz üretilmedi — onay verildiğinde talepname otomatik üretilir.</span> : [...new Map(d.map((x) => [x.docType, x])).values()].map((x) => <a key={x.id} className="btn secondary" href={`/api/belge/${x.id}`} target="_blank" rel="noreferrer">{x.docType === "TALEPNAME" ? "Talepname" : x.docType === "TAAHHUTNAME" ? "Taahhütname" : "Beyan formu"} v{x.version} (PDF)</a>)}
                <Link className="btn secondary" href={`/operasyonlar/${op.ref}`}>İş detayı</Link>
              </div>
              <p className="small muted">Onayınız, talepnamenin şu anki sürümüne bağlanır. Beyan veya kapsam değişirse yeniden onay istenir. Ödeme yükümlülüğü <a href="#ODEME_TAAHHUDU">Ödeme ve Fatura Muhatabı Taahhütnamesi</a> kapsamındadır.</p>
              <BillingDecisionForm opRef={op.ref} customer signer={`${signer.name}${signer.title ? ` / ${signer.title}` : ""}`} />
            </details>
          );
        })}
        {decided.filter((d) => d.decision !== "PENDING").length > 0 && (
          <details style={{ marginTop: 10 }}><summary className="small">Önceki kararlarım ({decided.filter((d) => d.decision !== "PENDING").length})</summary>
            <table><tbody>{decided.filter((d) => d.decision !== "PENDING").map((d) => { const o = ops.find((x) => x.op.id === d.operationId)!; return <tr key={d.id}><td className="mono small"><Link href={`/operasyonlar/${o.op.ref}`}>{o.op.ref}</Link></td><td>{o.vessel}</td><td><span className={`badge ${d.decision === "APPROVED" ? "ok" : "bad"}`}>{d.decision === "APPROVED" ? "Onaylandı" : "Reddedildi"}</span></td><td className="small">{d.authorizedPerson} · {fmtDT(d.decidedAt)}</td></tr>; })}</tbody></table>
          </details>
        )}
      </div>

      {status.map(({ template: t, acceptance: a }) => (
        <section key={t.id} id={t.code} className="card contract-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>{t.title}</h2>
            <span className="muted small">Sürüm {t.version} · yürürlük {fmtDT(t.effectiveFrom)}{t.isDemo && <> · <span className="badge demo">ÖRNEK METİN — hukuk onayı bekliyor</span></>}</span>
          </div>
          <div className="contract-scroll" tabIndex={0} aria-label={`${t.title} metni`}><ContractText body={t.body} /></div>
          {a ? (
            <div className="alert ok"><span>✓</span><div><b>{METHOD[a.method] ?? a.method} · {fmtDT(a.acceptedAt)}</b>{a.signerName}{a.signerTitle ? `, ${a.signerTitle}` : ""} tarafından {party.legalName} adına onaylandı. Metin özeti: <span className="mono small">{a.textHash.slice(0, 16)}…</span></div></div>
          ) : t.code === "BEYAN_TAAHHUDU" ? (
            <div className="alert info"><span>ⓘ</span><div>Bu taahhüt her talep gönderiminde, o talebin gemi ve yük bilgileri için ayrıca onaylanır.</div></div>
          ) : (
            <AcceptForm templateId={t.id} hash={textHash(t.body)} signer={signer} withSignature={REQUIRED_FOR_REQUESTS.includes(t.code as ContractCode)} />
          )}
        </section>
      ))}
    </>
  );
}
