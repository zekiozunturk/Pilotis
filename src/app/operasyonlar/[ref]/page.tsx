import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { loadOperation, computeOperation, verifiedGt } from "@/lib/ops";
import { actualDuration, type ServiceKindT } from "@/lib/durations";
import { STATUS_SETS, EVENT_LABELS } from "@/lib/labels";
import { SERVICE_LABELS } from "@/data/catalog";
import { fmtDT, fmtTime, fmtMin, fmtNum, fmtMoney } from "@/lib/format";
import { CalcCard } from "@/components/CalcCard";
import { FieldActions } from "./field";
import { VerifyForm, BillingPartyForm, BillingDecisionForm, SaveCalcForm } from "./forms";
import { DocumentsPanel, type DocRow } from "./docs";
import { DOC_TYPES } from "@/lib/docs/builders";
import { currentScope } from "@/lib/session";
import { canSeeOperation } from "@/lib/scope";
import { declarationImpact, type Declaration } from "@/lib/declaration";
import { desc, eq, inArray } from "drizzle-orm";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  return { title: (await params).ref };
}

const LAYER: Record<string, string> = { CUSTOMER_DECLARED: "Müşteri beyanı", FIELD_VERIFIED: "Saha doğrulaması", APPROVED_FINAL: "Onaylı son durum" };

export default async function OperationDetail({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const o = await loadOperation(ref);
  if (!o) notFound();
  const scope = await currentScope();
  // Başka müşterinin kaydı: varlığı dahi açığa çıkarılmaz
  if (!canSeeOperation(scope, { ...o.op, agentPartyId: o.portCall.agentPartyId })) notFound();
  const internal = !scope.external;
  const docRows = await db.select().from(s.documentVersions).where(eq(s.documentVersions.operationId, o.op.id)).orderBy(desc(s.documentVersions.createdAt));
  const approvals = docRows.length ? await db.select().from(s.documentApprovals).where(inArray(s.documentApprovals.documentVersionId, docRows.map((d) => d.id))) : [];
  const docs: DocRow[] = docRows.map((d) => ({ id: d.id, docType: d.docType, version: d.version, fileName: d.fileName, sha256: d.sha256, origin: d.origin, signature: d.signature, signedBy: d.signedBy, createdAt: d.createdAt.toISOString(), sizeBytes: d.sizeBytes,
    approvals: approvals.filter((a) => a.documentVersionId === d.id).map((a) => ({ name: a.approverName, level: a.level, decision: a.decision, at: a.decidedAt.toISOString() })), isApprovedBase: o.billing?.approvedDocVersionId === d.id && o.billing?.decision === "APPROVED" }));
  const customerDecl = o.requests.find((r) => r.layer === "CUSTOMER_DECLARED")?.payload as Declaration | undefined;
  const lastDecl = o.requests.at(-1)?.payload as Declaration | undefined;
  const mismatch = o.requests.length > 1 ? declarationImpact(customerDecl, lastDecl ?? {}) : null;
  const { results, error } = await computeOperation(o);
  const parties = await db.select().from(s.parties).orderBy(asc(s.parties.legalName));
  const companies = parties.filter((p) => p.kind !== "AUTHORITY").map((p) => ({ id: p.id, label: p.legalName }));
  const evs = o.events.map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString() }));
  const assetName = (id: string | null) => o.assets.find((a) => a.id === id)?.name;
  const tugs = o.assets.filter((a) => a.type === "TUG").map((a) => ({ id: a.id, name: a.name }));
  const declarationChecked = o.events.some((e) => e.type === "DECLARATION_CHECKED");
  const vGt = verifiedGt(o);
  const declared = o.requests.find((r) => r.layer === "CUSTOMER_DECLARED")?.payload as { gt?: number | null } | undefined;
  const total = results.reduce((a, r) => a + (r.missing.length ? 0 : Number(r.netAmount)), 0);
  const currency = results[0]?.currency ?? "USD";
  const opRec = o.op as unknown as Record<string, string>;

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="muted" style={{ fontSize: 12 }}><Link href="/operasyonlar">Operasyonlar</Link> / {o.portCall.ref}</div>
          <h1><span className="mono" style={{ fontSize: 20 }}>{o.op.ref}</span> · {o.vessel.name} {o.op.isDemo && <span className="badge demo">ÖRNEK VERİ</span>}</h1>
          <div className="muted">{o.type.code} {o.type.nameTr} · {o.from?.name ?? "—"} → {o.to?.name ?? "—"} · Plan: {fmtDT(o.op.plannedStart)}</div>
        </div>
      </div>

      <div className="statusrow" style={{ marginBottom: 16 }}>
        {STATUS_SETS.map((x) => (
          <div key={x.key} className="statusbox"><div className="k">{x.label}</div><div className="s">{x.values[opRec[x.key]]}</div></div>
        ))}
      </div>

      <div className="grid g2">
        {/* Sol sütun */}
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <h2>Taraflar ve fatura muhatabı</h2>
            <table><tbody>
              <tr><td className="muted">Talep eden</td><td>{o.requester?.legalName ?? "—"}</td></tr>
              <tr><td className="muted">Acente</td><td>{o.agent?.legalName ?? "—"}</td></tr>
              <tr><td className="muted">Fatura muhatabı</td><td>{o.billingParty?.legalName ?? <span className="badge warn">Belirlenmedi</span>}</td></tr>
              <tr><td className="muted">Muhatap onayı</td><td>{o.billing ? (
                <span className={`badge ${o.billing.decision === "APPROVED" ? "ok" : o.billing.decision === "REJECTED" ? "bad" : "warn"}`}>
                  {o.billing.decision === "APPROVED" ? `Onaylandı · ${o.billing.authorizedPerson} · ${fmtDT(o.billing.decidedAt)}` : o.billing.decision === "REJECTED" ? "Reddedildi" : "Onay bekliyor"}
                </span>) : "—"}
                {o.billing?.approvedDocVersionId && <div className="muted" style={{ fontSize: 11.5 }}>Onaylanan içerik: <span className="mono">{docRows.find((d) => d.id === o.billing!.approvedDocVersionId)?.fileName ?? "—"}</span></div>}
              </td></tr>
            </tbody></table>
            <div className="sep" />
            {o.billing?.note && <div className="alert warn" style={{ marginBottom: 8 }}><span>↻</span><div><b>Yeniden onay gerekiyor</b>{o.billing.note}</div></div>}
            {internal && !o.op.billingPartyId && <BillingPartyForm opRef={o.op.ref} parties={companies} />}
            {o.billing && o.billing.decision !== "APPROVED" && (internal || scope.partyId === o.billing.billingPartyId) && <BillingDecisionForm opRef={o.op.ref} />}
            {o.op.billingPartyId && o.op.billingPartyId === o.op.requesterPartyId && <div className="muted" style={{ fontSize: 12 }}>Talep eden ile muhatap aynı — yine de ayrı onay kaydı tutulur.</div>}
          </div>

          <div className="card">
            <h2>Gemi ve beyan</h2>
            <table><tbody>
              <tr><td className="muted">IMO / bayrak / tip</td><td>{o.vessel.imo ?? o.vessel.altOfficialId ?? "—"} · {o.vessel.flag ?? "—"} · {o.vessel.vesselType ?? "—"}</td></tr>
              <tr><td className="muted">Kayıtlı GT / NT / DWT</td><td>{fmtNum(o.vessel.gt)} / {fmtNum(o.vessel.nt)} / {fmtNum(o.vessel.dwt)}</td></tr>
              <tr><td className="muted">Beyan edilen GT</td><td>{fmtNum(declared?.gt ?? null)}</td></tr>
              <tr><td className="muted">Hesaba giren GT</td><td>{vGt !== null ? <b>{fmtNum(vGt)}</b> : <span className="badge warn">Saha doğrulaması yok</span>}
                {vGt !== null && declared?.gt != null && vGt !== declared.gt && <span className="badge bad" style={{ marginLeft: 6 }}>Beyan uyuşmazlığı</span>}</td></tr>
              <tr><td className="muted">Yük durumu</td><td>{o.portCall.cargoCondition}{o.portCall.isCabotage ? " · kabotaj" : ""}{o.portCall.repairPurpose ? ` · onarım: ${o.portCall.repairPurpose}` : ""}</td></tr>
            </tbody></table>
            <div className="sep" />
            <h3>Beyan sürümleri (silinmez)</h3>
            <table><thead><tr><th>V</th><th>Katman</th><th>İçerik</th><th>Zaman</th></tr></thead><tbody>
              {o.requests.map((r) => <tr key={r.id}><td className="mono">v{r.version}</td><td>{LAYER[r.layer]}</td><td style={{ fontSize: 12 }}>{Object.entries(r.payload as Record<string, unknown>).filter(([, v]) => v !== null && v !== "").map(([k, v]) => <span key={k} style={{ marginRight: 8, whiteSpace: "nowrap" }}><span className="muted">{k}</span> <b>{String(v)}</b></span>)}</td><td>{fmtDT(r.createdAt)}</td></tr>)}
            </tbody></table>
            {mismatch && mismatch.changes.length > 0 && <>
              <div className="sep" />
              <div className="alert warn"><span>⚠</span><div><b>Beyan ile son durum farklı</b>
                {mismatch.changes.map((c) => <div key={c.key} style={{ display: "block" }}>{c.label}: {String(c.from ?? "—")} → <b>{String(c.to)}</b>{c.critical ? " (kritik)" : ""}</div>)}
                <div style={{ marginTop: 4 }}>Etkilenen: {mismatch.affected.join(", ")}</div></div></div>
            </>}
            {internal && <><div className="sep" />
            <VerifyForm opRef={o.op.ref} gt={String(vGt ?? declared?.gt ?? "")} engine={String(lastDecl?.engine ?? "")} cargo={String(lastDecl?.cargoCondition ?? o.portCall.cargoCondition ?? "")} /></>}
          </div>

          <div className="card">
            <h2>Hizmet satırları ve gerçek süreler</h2>
            <table><thead><tr><th>Hizmet</th><th>Tahsis</th><th>Ücretlenebilir</th><th>Başlangıç</th><th>Bitiş</th><th>Gerçek süre</th><th>Bekleme</th></tr></thead><tbody>
              {o.lines.map((l) => {
                const k = l.kind as ServiceKindT;
                const d = ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"].includes(l.kind) ? actualDuration(evs, k) : null;
                return <tr key={l.id}><td>{SERVICE_LABELS[l.kind]}</td><td>{l.allocatedUnits ?? "—"}</td><td>{l.billableUnits ?? "—"}</td>
                  <td>{fmtTime(d?.start)}</td><td>{fmtTime(d?.end)}</td><td>{fmtMin(d?.grossMinutes ?? null)}</td><td>{d?.pauseMinutes ? fmtMin(d.pauseMinutes) : "—"}</td></tr>;
              })}
              {tugs.map((t) => {
                const d = actualDuration(evs, "TOWAGE", t.id);
                if (!d.start) return null;
                return <tr key={t.id}><td style={{ paddingLeft: 24 }}>↳ {t.name}</td><td /><td /><td>{fmtTime(d.start)}</td><td>{fmtTime(d.end)}</td><td>{fmtMin(d.grossMinutes)}</td><td /></tr>;
              })}
            </tbody></table>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Gerçek zaman damgaları yuvarlanmaz; ücretlendirilen süre tarife sürümünden, bildirilecek süre LYBS alan tanımından (AK-07) ayrıca üretilir.</div>
          </div>
        </div>

        {/* Sağ sütun */}
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <h2>Belgeler</h2>
            <DocumentsPanel opRef={o.op.ref} types={Object.entries(DOC_TYPES)} docs={docs} canGenerate={internal} />
          </div>

          {internal && <div className="card">
            <h2>Saha işlemleri</h2>
            {!declarationChecked && o.op.opStatus !== "COMPLETED" && <div className="alert warn" style={{ marginBottom: 10 }}><span>⚠</span><div>Hizmet başlatılmadan önce beyan sahada kontrol edilmeli (soldaki "Beyanı kontrol et").</div></div>}
            <FieldActions opRef={o.op.ref} opStatus={o.op.opStatus} tugs={tugs} declarationChecked={declarationChecked} />
          </div>}

          <div className="card">
            <h2>Olay zaman çizelgesi</h2>
            <ul className="timeline">
              {o.events.map((e) => (
                <li key={e.id}>
                  <span className="t">{fmtTime(e.occurredAt)}</span>
                  <span className={`dot ${["SERVICE_END", "PILOT_DISEMBARKED", "INCIDENT", "CANCEL_OR_INCOMPLETE"].includes(e.type) ? "o" : ""}`} />
                  <span>{EVENT_LABELS[e.type]}{e.assetId ? ` · ${assetName(e.assetId)}` : ""}{e.serviceKind ? <span className="muted"> · {SERVICE_LABELS[e.serviceKind]}</span> : ""}{e.note ? <span className="muted"> — {e.note}</span> : ""}{e.reasonCode ? <span className="badge grey" style={{ marginLeft: 6 }}>{e.reasonCode}</span> : ""}</span>
                </li>
              ))}
              {o.events.length === 0 && <li className="muted empty">Henüz saha olayı yok.</li>}
            </ul>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2>Bu bedel neden oluştu?</h2>
              {results.length > 0 && <b style={{ fontSize: 18, color: "var(--navy-800)" }}>{fmtMoney(String(total), currency)}</b>}
            </div>
            {error && <div className="alert bad"><span>⚠</span><div>{error}</div></div>}
            <div className="grid" style={{ gap: 10 }}>{results.map((r) => <CalcCard key={r.serviceKind} r={r} />)}</div>
            {internal && <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <SaveCalcForm opRef={o.op.ref} />
              <span className="muted" style={{ fontSize: 12 }}>Kayıt, girdi hash'i ve tarife sürümüyle sabitlenir.</span>
            </div>}
            {o.calcs.length > 0 && <>
              <div className="sep" />
              <h3>Kayıtlı hesaplar</h3>
              <table><thead><tr><th>Zaman</th><th>Tür</th><th>Hizmet</th><th>Tutar</th><th>Üretim</th></tr></thead><tbody>
                {o.calcs.map((c) => <tr key={c.id}><td>{fmtDT(c.createdAt)}</td><td>{c.kind}</td><td>{SERVICE_LABELS[(c.breakdown as { serviceKind: string }).serviceKind]}</td><td>{fmtMoney(c.netAmount, c.currency)}</td><td>{c.productionEligible ? <span className="badge ok">Uygun</span> : <span className="badge warn">Engelli</span>}</td></tr>)}
              </tbody></table>
            </>}
          </div>
        </div>
      </div>
    </>
  );
}
