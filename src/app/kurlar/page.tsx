import { desc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage } from "@/lib/session";
import { getFxPolicy, getFxTable, RATE_TYPE_LABEL, DATE_RULE_LABEL } from "@/lib/fx";
import { INVOICE_NOTE } from "@/data/catalog";
import { fmtDT } from "@/lib/format";
import { PullForm, ManualForm, PolicyForm } from "./forms";

export const metadata = { title: "Döviz kurları" };

export default async function Rates() {
  await requireInternalPage();
  const policy = await getFxPolicy();
  const rows = await db.select().from(s.exchangeRates).orderBy(desc(s.exchangeRates.bulletinDate), desc(s.exchangeRates.fetchedAt)).limit(60);
  const now = await getFxTable(new Date().toISOString());
  return (
    <>
      <div className="pagehead"><div><h1>Döviz kurları</h1><div className="muted">Operasyonel para birimi TL. Döviz tarifeli kalemler hizmet anındaki kurla TL'ye çevrilir; müşteri gösterimi bilgi amaçlıdır.</div></div></div>
      <div className="alert info" style={{ marginBottom: 16 }}><span>₺</span><div><b>Fatura ibaresi</b>{INVOICE_NOTE}</div></div>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        {(["USD", "EUR"] as const).map((c) => (
          <div className="card kpi" key={c}>
            <div className="l">Bugün biten işlerde {c}/TRY</div>
            <div className="v">{now[c] ? Number(now[c]!.rate).toLocaleString("tr-TR", { minimumFractionDigits: 4 }) : "—"}</div>
            <div className="muted" style={{ fontSize: 12 }}>{now[c] ? `${now[c]!.source} · bülten ${now[c]!.date}` : "Bu tarih için kur yok — TL karşılığı hesaplanmaz"}</div>
            {now[c]?.provisional && <div className="badge warn" style={{ marginTop: 4 }}>Geçici — {now[c]!.note}</div>}
          </div>
        ))}
        <div className="card">
          <h2>Kur politikası</h2>
          <div style={{ fontSize: 13 }}><b>{RATE_TYPE_LABEL[policy.rateType]}</b> · {DATE_RULE_LABEL[policy.dateRule]}</div>
          <div className="badge ok" style={{ marginTop: 6 }}>İşletme kararı: TCMB döviz satış</div>
          <div style={{ fontSize: 12, marginTop: 6 }}><a href="/ayarlar">Ayarlardan değiştir →</a></div>
        </div>
      </div>
      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card"><h2>TCMB'den güncelle</h2>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Canlı sunucuda günlük otomatik çekim: <span className="mono">POST /api/kur/guncelle</span> (CRON_SECRET başlığıyla). Bülten her iş günü 15:30'da yayımlanır; 15:45 sonrası çekilmelidir. İş hafta sonu biterse cuma bülteni kullanılır.</div>
          <PullForm />
          <div className="sep" />
          <h3>Elle giriş (TCMB'ye erişilemediğinde)</h3>
          <ManualForm />
        </div>
        <div className="card"><h2>Kur ayarı</h2><PolicyForm rateType={policy.rateType} dateRule={policy.dateRule} /></div>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Bülten tarihi</th><th>Döviz</th><th>Döviz alış</th><th>Döviz satış</th><th>Kaynak</th><th>Bülten no</th><th>Kaydeden</th><th>Kayıt zamanı</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className="mono">{r.bulletinDate}</td><td><b>{r.currency}</b></td><td className="mono">{r.forexBuying ? Number(r.forexBuying).toFixed(4) : "—"}</td><td className="mono">{r.forexSelling ? Number(r.forexSelling).toFixed(4) : "—"}</td>
            <td><span className={`badge ${r.source === "TCMB" ? "ok" : "warn"}`}>{r.source === "TCMB" ? "TCMB" : "Elle"}</span></td><td>{r.bulletinNo ?? "—"}</td><td>{r.enteredBy ?? "—"}</td><td>{fmtDT(r.fetchedAt)}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={8} className="muted">Kur kaydı yok.</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}
