import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage, currentRole, ROLE_LABELS } from "@/lib/session";
import { getFxPolicy, getFxTable, RATE_TYPE_LABEL, DATE_RULE_LABEL } from "@/lib/fx";
import { INVOICE_NOTE } from "@/data/catalog";
import { fmtDT } from "@/lib/format";
import { PolicyForm } from "../kurlar/forms";
import { LeadForm } from "./portal-form";
import { minLeadHours } from "@/lib/lead-time";

export const metadata = { title: "Ayarlar" };

export default async function Settings() {
  await requireInternalPage();
  const role = await currentRole();
  const policy = await getFxPolicy();
  const fx = await getFxTable(new Date().toISOString());
  const history = await db.select().from(s.auditLog).where(and(eq(s.auditLog.entity, "app_settings"), eq(s.auditLog.entityId, "fx.policy"))).orderBy(desc(s.auditLog.at)).limit(20);
  const canEdit = ["BUSINESS_MANAGER", "ACCOUNTING", "SYSTEM_ADMIN"].includes(role);
  return (
    <>
      <div className="pagehead"><div><h1>Ayarlar</h1><div className="muted">İşletme genelinde geçerli tercihler. Her değişiklik gerekçesi ve yapanıyla kaydedilir; kayıtlı hesaplar geriye dönük değişmez.</div></div><a className="btn secondary" href="/ayarlar/tema">🎨 Tema Stüdyosu</a></div>
      <div className="grid g2">
        <div className="card">
          <h2>Müşteri portalı</h2>
          <LeadForm hours={await minLeadHours()} canEdit={["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"].includes(role)} />
        </div>
        <div className="card">
          <h2>Döviz çevrim kuru</h2>
          <table style={{ marginBottom: 12 }}><tbody>
            <tr><td className="muted">Operasyonel para birimi</td><td><b>TL</b></td></tr>
            <tr><td className="muted">Kur tipi</td><td><b>TCMB {RATE_TYPE_LABEL[policy.rateType]}</b></td></tr>
            <tr><td className="muted">Kur tarihi</td><td>{DATE_RULE_LABEL[policy.dateRule]}</td></tr>
            <tr><td className="muted">Bugün biten işlerde</td><td className="mono">{fx.USD ? `USD ${fx.USD.rate}` : "USD —"} · {fx.EUR ? `EUR ${fx.EUR.rate}` : "EUR —"}{fx.USD ? ` (${fx.USD.source}, bülten ${fx.USD.date})` : ""}</td></tr>
          </tbody></table>
          {canEdit ? <PolicyForm rateType={policy.rateType} dateRule={policy.dateRule} />
            : <div className="alert info"><span>🔒</span><div>Bu ayarı işletme yöneticisi veya muhasebe değiştirebilir (aktif rol: {ROLE_LABELS[role]}).</div></div>}
        </div>
        <div className="card">
          <h2>Fatura ibaresi</h2>
          <div className="alert info"><span>₺</span><div>{INVOICE_NOTE}</div></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Hesap ekranlarında, müşteri portalında ve PDF belgelerde gösterilir.</div>
          <div className="sep" />
          <h2>Değişiklik geçmişi</h2>
          <table><tbody>
            {history.map((h) => {
              const v = h.after as { rateType?: string; dateRule?: string };
              return <tr key={h.id}><td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDT(h.at)}</td><td style={{ fontSize: 12.5 }}>TCMB {RATE_TYPE_LABEL[v.rateType as keyof typeof RATE_TYPE_LABEL] ?? v.rateType} · {v.dateRule === "COMPLETION_DAY_BULLETIN" ? "iş bitiş günü (hafta sonu → cuma)" : v.dateRule === "SAME_DAY_BULLETIN" ? "hizmet günü dahil" : "önceki bülten"}</td><td style={{ fontSize: 12 }}>{ROLE_LABELS[h.actorId as keyof typeof ROLE_LABELS] ?? h.actorId}{h.reason ? ` — ${h.reason}` : ""}</td></tr>;
            })}
            {history.length === 0 && <tr><td className="muted">Değişiklik yok.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
