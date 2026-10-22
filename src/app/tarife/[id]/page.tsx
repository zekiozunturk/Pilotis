import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage, currentRole, ROLE_LABELS } from "@/lib/session";
import { loadVersion, runReferenceCases } from "@/lib/tariff/repo";
import { approvalBlockers } from "@/lib/tariff/admin";
import { STATUS_LABELS, SERVICE_LABELS } from "@/data/catalog";
import { fmtDT, fmtMoney } from "@/lib/format";
import type { ServiceTariff } from "@/lib/tariff/types";
import { TransitionButton, ResolveNoteForm, DeriveForm, AddCaseForm } from "./forms";
import { evaluateItem } from "@/lib/pricing/pricelist";
import { getFxTable } from "@/lib/fx";
import { fmtCcy } from "@/lib/money";
import { INVOICE_NOTE } from "@/data/catalog";

export async function generateMetadata() { return { title: "Tarife sürümü" }; }
const tone = (st: string) => (st === "IN_FORCE" || st === "APPROVED" ? "ok" : st === "REPEALED" ? "grey" : "warn");
const SRC: Record<string, string> = { INDEPENDENT_MANUAL: "Bağımsız elle hesap", OFFICIAL_EXAMPLE: "Resmî tablo", HISTORICAL_JOB: "Geçmiş iş" };

function SvcRow({ name, svc }: { name: string; svc: ServiceTariff }) {
  if (svc.itemCode) return <tr><td>{SERVICE_LABELS[name] ?? name}</td><td colSpan={2}>Fiyat listesi kalemi <span className="mono"><b>[{svc.itemCode}]</b></span></td><td>{svc.gtCap ? svc.gtCap.toLocaleString("tr-TR") : "—"}</td><td style={{ fontSize: 12 }}>{svc.unit === "HOUR" ? "Saat (kesri tam)" : "Manevra"}{svc.note ? ` · ${svc.note}` : ""}</td></tr>;
  if (svc.pricing === "BOLLARD_PULL") return <tr><td>{SERVICE_LABELS[name] ?? name}</td><td colSpan={3} style={{ fontSize: 12 }}>{svc.bollardBands?.map((b) => `${b.fromT}–${b.toT ?? "∞"} t: ${b.rate}`).join(" · ")} USD/saat</td><td>{svc.unit === "HOUR" ? "Saat (kesri tam)" : "Olay"}</td></tr>;
  const b = svc.bands[0];
  return <tr><td>{SERVICE_LABELS[name] ?? name}</td><td className="mono">{b?.base}</td><td className="mono">{b?.perBlock ? `+${b.perBlock}` : "—"}</td><td>{svc.gtCap ? svc.gtCap.toLocaleString("tr-TR") : "—"}</td><td style={{ fontSize: 12 }}>{svc.unit === "HOUR" ? "Saat" : "Manevra"}{svc.note ? ` · ${svc.note}` : ""}</td></tr>;
}

export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInternalPage();
  const { id } = await params;
  const v = await loadVersion(id);
  if (!v) notFound();
  const role = await currentRole();
  const def = v.input.definition;
  const refs = await runReferenceCases(v.input);
  const blockers = approvalBlockers({ definition: def, isDemo: v.row.isDemo }, refs);
  const editable = ["DRAFT", "SOURCE_FOUND"].includes(v.row.status);
  const history = await db.select().from(s.auditLog).where(eq(s.auditLog.entityId, v.row.id)).orderBy(desc(s.auditLog.at)).limit(15);
  const siblings = await db.select({ id: s.tariffVersions.id, label: s.tariffVersions.label }).from(s.tariffVersions).where(eq(s.tariffVersions.familyId, v.row.familyId));
  const cats = Object.entries(def.categories ?? {});
  const open = (def.verificationNotes ?? []).filter((n) => !n.resolved);
  const passCount = refs.filter((r) => r.pass).length;
  const fxNow = await getFxTable(new Date().toISOString());
  const sampleVars = { GT: 8450, GT_TAVAN: 8450, BLOK: 8, CEKI: 50, SAAT: 1, ROMORKOR: 1 };
  const itemRows = (def.items ?? []).map((it) => {
    try {
      const r = evaluateItem(def.items!, it.code, sampleVars, fxNow);
      const tl = r.currency === "TRY" ? r.value.toFixed(2) : fxNow[r.currency] ? r.value.times(fxNow[r.currency]!.rate).toFixed(2) : null;
      return { it, value: r.value.toDecimalPlaces(4).toString(), tl, err: null as string | null };
    } catch (e) { return { it, value: null, tl: null, err: (e as Error).message }; }
  });
  const serviceKinds = [...new Set([...Object.keys(def.services), ...cats.flatMap(([, c]) => Object.keys(c.services))])];

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="muted" style={{ fontSize: 12 }}><Link href="/tarife">Tarife</Link> / {v.family.name}</div>
          <h1>{v.row.label} <span className={`badge ${tone(v.row.status)}`}>{STATUS_LABELS[v.row.status]}</span> {v.row.isDemo && <span className="badge demo">ÖRNEK</span>}</h1>
          <div className="muted">{fmtDT(v.row.validFrom)} – {fmtDT(v.row.validTo)} · {v.row.currency} · rev {v.row.rev}{v.row.changeNote ? ` · ${v.row.changeNote}` : ""}</div>
        </div>
        <div className="toolbar datatools" role="toolbar" aria-label="Veri işlemleri">
          {editable && ["SYSTEM_ADMIN", "BUSINESS_MANAGER", "TARIFF_OFFICER"].includes(role) && <Link className="btn secondary" href={`/aktarim?varlik=fiyat-listesi&hedef=${v.row.id}`}>Fiyat listesini Excel'den al</Link>}
          <a className="btn secondary" href={`/api/disa-aktar/fiyat-listesi?target=${v.row.id}`} download>Fiyat listesini Excel'e aktar</a>
          <a className="btn secondary" href="#gecmis">Sürüm geçmişi</a>
          {editable && <Link className="btn secondary" href={`/tarife/${v.row.id}/duzenle`}>Düzenle</Link>}
          {siblings.length > 1 && <Link className="btn secondary" href={`/tarife/karsilastir?a=${v.row.parentVersionId ?? siblings.find((x) => x.id !== v.row.id)!.id}&b=${v.row.id}`}>Karşılaştır</Link>}
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h2>Onay akışı</h2>
          <div className="statusrow" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 12 }}>
            <div className="statusbox"><div className="k">Hazırlayan</div><div className="s">{v.row.preparedBy ? ROLE_LABELS[v.row.preparedBy as keyof typeof ROLE_LABELS] ?? v.row.preparedBy : "—"}</div></div>
            <div className="statusbox"><div className="k">İncelemeye gönderen</div><div className="s">{v.row.submittedBy ? `${ROLE_LABELS[v.row.submittedBy as keyof typeof ROLE_LABELS] ?? v.row.submittedBy}` : "—"}</div></div>
            <div className="statusbox"><div className="k">Onaylayan</div><div className="s">{v.row.approvedBy ? `${ROLE_LABELS[v.row.approvedBy as keyof typeof ROLE_LABELS] ?? v.row.approvedBy} · ${fmtDT(v.row.approvedAt)}` : "—"}</div></div>
            <div className="statusbox"><div className="k">Yürürlüğe alan</div><div className="s">{v.row.publishedBy ? `${ROLE_LABELS[v.row.publishedBy as keyof typeof ROLE_LABELS] ?? v.row.publishedBy} · ${fmtDT(v.row.publishedAt)}` : "—"}</div></div>
          </div>
          {blockers.length > 0 && !["APPROVED", "IN_FORCE", "REPEALED"].includes(v.row.status) && <div className="alert warn" style={{ marginBottom: 10 }}><span>⚠</span><div><b>Onay ön koşulları eksik</b>{blockers.join(" · ")}</div></div>}
          <div className="toolbar">
            {editable && <TransitionButton id={v.row.id} to="EXPERT_REVIEW" label="Uzman incelemesine gönder" />}
            {v.row.status === "EXPERT_REVIEW" && <><TransitionButton id={v.row.id} to="APPROVED" label="Onayla" /><TransitionButton id={v.row.id} to="DRAFT" label="Taslağa iade et" danger needReason /></>}
            {v.row.status === "APPROVED" && <TransitionButton id={v.row.id} to="IN_FORCE" label="Yürürlüğe al" />}
            {["APPROVED", "IN_FORCE"].includes(v.row.status) && <TransitionButton id={v.row.id} to="REPEALED" label="Yürürlükten kaldır" danger needReason />}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Görev ayrılığı: tarife sorumlusu hazırlar ve gönderir; işletme yöneticisi onaylar ve yürürlüğe alır. Aktif rolünüz: <b>{ROLE_LABELS[role]}</b>. Onaylı sürüm düzenlenemez; değişiklik için yeni sürüm türetilir.</div>
        </div>
        <div className="card">
          <h2>Kaynak</h2>
          {def.source ? <div style={{ fontSize: 13 }}><b>{def.source.title}</b><div>{def.source.docNo} · {def.source.publishedAt}</div>{def.source.url && <a href={def.source.url} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all", fontSize: 12 }}>{def.source.url}</a>}<div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{def.source.note}</div></div> : <div className="muted">Kaynak bilgisi yok.</div>}
          <div className="sep" />
          <div style={{ fontSize: 13 }}>Referans vakalar: <b style={{ color: passCount === refs.length && refs.length ? "var(--ok)" : "var(--bad)" }}>{passCount}/{refs.length} geçti</b></div>
          <div style={{ fontSize: 13 }}>Açık doğrulama notu: <b style={{ color: open.length ? "var(--warn)" : "var(--ok)" }}>{open.length}</b></div>
        </div>
      </div>

      {(def.verificationNotes?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Doğrulama notları</h2>
          {def.verificationNotes!.map((n) => (
            <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="mono">{n.id}</span> <span className={`badge ${n.resolved ? "ok" : "warn"}`}>{n.resolved ? "Çözüldü" : "Açık"}</span> {n.text}
              {n.resolution && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>↳ {n.resolution}</div>}
              {!n.resolved && editable && <ResolveNoteForm id={v.row.id} noteId={n.id} />}
            </div>
          ))}
        </div>
      )}

      <div className="grid g2" style={{ marginBottom: 16 }}>
        {(cats.length ? cats : [["_", { label: "Genel", services: def.services }] as const]).map(([k, c]) => (
          <div className="card" key={k}>
            <h2>{c.label}</h2>
            <table><thead><tr><th>Hizmet</th><th colSpan={2}>Fiyatlandırma</th><th>GT tavanı</th><th>Birim</th></tr></thead>
              <tbody>{Object.entries(c.services).map(([sk, svc]) => svc && <SvcRow key={sk} name={sk} svc={svc} />)}</tbody></table>
          </div>
        ))}
      </div>

      {itemRows.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h2>Fiyat listesi ({itemRows.length} kalem)</h2>
            <span className="muted" style={{ fontSize: 12 }}>Örnek değer: GT 8.450, çeki 50 t · kur: {fxNow.USD ? `USD ${fxNow.USD.rate} (${fxNow.USD.source}, ${fxNow.USD.date})` : "yok"}</span>
          </div>
          <div className="tablewrap" style={{ border: 0, maxHeight: 520, overflowY: "auto" }}>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Kod</th><th>Kalem</th><th>Birim</th><th>PB</th><th>Fiyat / formül</th><th>Hizmet</th><th>Kategori</th><th>Örnek</th><th>TL karşılığı</th></tr></thead>
              <tbody>{itemRows.map(({ it, value, tl, err }) => (
                <tr key={it.code}>
                  <td className="mono"><b>{it.code}</b></td><td>{it.name}{it.note && <div className="muted" style={{ fontSize: 11 }}>{it.note}</div>}</td><td>{it.unit}</td><td><span className={`badge ${it.currency === "TRY" ? "ok" : "grey"}`}>{it.currency}</span></td>
                  <td className="mono">{it.formula ? <>= {it.formula}</> : it.price}</td>
                  <td>{it.serviceKind ? SERVICE_LABELS[it.serviceKind] : "—"}</td><td style={{ fontSize: 12 }}>{it.serviceKind ? (it.category ? def.categories?.[it.category]?.label ?? it.category : "Tümü") : "—"}</td>
                  <td className="mono">{value !== null ? fmtCcy(value, it.currency) : <span style={{ color: "var(--bad)" }}>{err}</span>}</td>
                  <td className="mono">{tl ? fmtCcy(tl, "TRY") : value !== null ? <span className="muted">kur yok</span> : ""}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{INVOICE_NOTE}</div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Artırım ve indirimler</h2>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>R-005: en yüksek artırım ve en yüksek indirim esas alınır; birlikte uygulanırsa oran farkı.</div>
        <table><thead><tr><th>Kod</th><th>Koşul</th><th>Tür</th><th>Oran</th><th>Hizmetler</th><th>Kapsam dışı</th><th>Kural</th></tr></thead>
          <tbody>{def.adjustments.map((a) => <tr key={a.code}><td className="mono">{a.code}</td><td>{a.label}</td><td>{a.kind === "SURCHARGE" ? "Artırım" : "İndirim"}</td><td><b>%{(Number(a.rate) * 100).toFixed(0)}</b></td><td style={{ fontSize: 12 }}>{a.appliesTo.map((x) => SERVICE_LABELS[x]).join(", ")}</td><td style={{ fontSize: 12 }}>{a.excludeCategories?.join(", ") ?? "—"}</td><td className="mono">{a.ruleCode}</td></tr>)}</tbody></table>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Referans test seti</h2>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Beklenen tutarlar bağımsız kaynaktan gelir; motor kendi sonucunu doğru kabul etmez. Onay için en az 5 vaka ve %100 başarı gerekir.</div>
        <div className="tablewrap" style={{ border: 0 }}>
          <table><thead><tr><th>Kod</th><th>Vaka</th><th>Kaynak</th><th>Hesap açıklaması</th><th>Beklenen</th><th>Motor</th><th></th></tr></thead>
            <tbody>{refs.map((r) => <tr key={r.id}><td className="mono">{r.code}</td><td>{r.title}</td><td style={{ fontSize: 12 }}>{SRC[r.source]}</td><td style={{ fontSize: 12 }}>{r.working}</td>
              <td className="mono">{fmtMoney(r.expected, v.row.currency)}</td><td className="mono">{r.actual ? fmtMoney(r.actual, v.row.currency) : r.missing.join(", ")}</td>
              <td>{r.pass ? <span className="badge ok">✓ Geçti</span> : <span className="badge bad">✗ Kaldı</span>}</td></tr>)}
              {refs.length === 0 && <tr><td colSpan={7} className="muted">Bu sürüm için vaka yok. Türetilmiş sürümlerde beklenen değerler yeni tablodan bağımsız hesaplanmalıdır — ana sürümden kopyalanmaz.</td></tr>}
            </tbody></table>
        </div>
        {editable && <><div className="sep" /><h3>Vaka ekle</h3>
          <AddCaseForm id={v.row.id} categories={cats.map(([k, c]) => [k, c.label])} adjustments={def.adjustments.map((a) => [a.code, a.label])} services={serviceKinds} defaultDate={v.row.validFrom.toISOString().slice(0, 10)} /></>}
      </div>

      <div className="grid g2">
        <div className="card"><h2>Endeksle yeni sürüm türet</h2><DeriveForm parentId={v.row.id} parentLabel={v.row.label} /></div>
        <div className="card">
          <h2 id="gecmis">Değişiklik geçmişi</h2>
          <table><tbody>{history.map((h) => <tr key={h.id}><td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDT(h.at)}</td><td className="mono" style={{ fontSize: 11.5 }}>{h.action}</td><td style={{ fontSize: 12 }}>{h.actorId ? ROLE_LABELS[h.actorId as keyof typeof ROLE_LABELS] ?? h.actorId : ""}{h.reason ? ` — ${h.reason}` : ""}</td></tr>)}
            {history.length === 0 && <tr><td className="muted">Kayıt yok.</td></tr>}</tbody></table>
        </div>
      </div>
    </>
  );
}
