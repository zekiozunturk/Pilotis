import { desc, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDT } from "@/lib/format";
import { KIND_LABEL, smsConfigured, smtpConfigured, appUrl, type Kind } from "@/lib/notify";
import { requireAdmin } from "../_guard";
import { retryAll } from "./actions";
import { TestForm } from "./test-form";

export const metadata = { title: "E-posta ve SMS" };
export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { SENT: ["Gönderildi", "ok"], QUEUED: ["Kuyrukta", ""], FAILED: ["Hata", "bad"], NO_CONFIG: ["Altyapı yok", "warn"] };
export default async function Page() {
  const me = await requireAdmin();
  const rows = await db.select().from(s.outbox).orderBy(desc(s.outbox.createdAt)).limit(100);
  const counts = (await db.select({ st: s.outbox.status, n: sql<number>`count(*)::int` }).from(s.outbox).groupBy(s.outbox.status));
  const c = (k: string) => counts.find((x) => x.st === k)?.n ?? 0;
  return (
    <>
      <div className="pagehead"><div><h1>E-posta ve SMS gönderimi</h1><div className="muted">Bildirimler önce sistem içi kutuya yazılır; e-posta ve SMS buradaki kuyruktan gider. Altyapı yokken oluşan iletiler kaybolmaz, yapılandırma sonrası yeniden gönderilebilir.</div></div>
        {(c("NO_CONFIG") + c("FAILED")) > 0 && <form action={retryAll}><button className="btn orange">Bekleyenleri yeniden gönder ({c("NO_CONFIG") + c("FAILED")})</button></form>}
      </div>
      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="tile"><div className="l">E-posta altyapısı (SMTP)</div><div className="v" style={{ fontSize: 16 }}>{smtpConfigured() ? <span className="badge ok">Tanımlı</span> : <span className="badge warn">Tanımlı değil</span>}</div><div className="d">{process.env.SMTP_FROM ?? "Gönderen: no-reply@yalovapilotaj.com"}</div></div>
        <div className="tile"><div className="l">SMS sağlayıcısı</div><div className="v" style={{ fontSize: 16 }}>{smsConfigured() ? <span className="badge ok">Tanımlı</span> : <span className="badge warn">Tanımlı değil</span>}</div><div className="d">Webhook üzerinden (Netgsm, İleti Merkezi vb. köprüsü)</div></div>
        <div className="tile"><div className="l">Gönderildi · kuyrukta</div><div className="v">{c("SENT")} · {c("QUEUED")}</div></div>
        <div className="tile"><div className="l">Altyapı bekleyen · hatalı</div><div className="v">{c("NO_CONFIG")} · {c("FAILED")}</div></div>
      </div>
      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Kurulum</h2>
          <p className="small">Sunucu ortam değişkenleri (şifreler veritabanına yazılmaz):</p>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "var(--input-bg)", padding: 10, borderRadius: 8 }}>{`SMTP_HOST=smtp.yalovapilotaj.com
SMTP_PORT=587
SMTP_USER=bildirim@yalovapilotaj.com
SMTP_PASS=********
SMTP_FROM="Yalova Pilotaj · PILOTIS <bildirim@yalovapilotaj.com>"
APP_URL=${appUrl()}
# SMS (isteğe bağlı): {to, text} JSON alan uç
SMS_WEBHOOK_URL=https://...
SMS_TOKEN=********`}</pre>
        </div>
        <div className="card"><h2>Deneme</h2><TestForm email={me.email} /><p className="muted small">SMTP tanımlı değilse ileti “Altyapı yok” olarak kuyrukta kalır.</p></div>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Zaman</th><th>Kanal</th><th>Alıcı</th><th>Konu</th><th>Durum</th></tr></thead>
        <tbody>{rows.map((r) => { const [l, cl] = ST[r.status] ?? [r.status, "grey"]; return (
          <tr key={r.id}><td className="small">{fmtDT(r.createdAt)}</td><td>{r.channel === "EMAIL" ? "E-posta" : "SMS"}</td><td className="small">{r.to}</td><td className="small">{r.subject ?? r.body.slice(0, 60)}<div className="muted">{KIND_LABEL[r.kind as Kind] ?? r.kind}{r.ref ? ` · ${r.ref}` : ""}</div></td><td><span className={`badge ${cl}`}>{l}</span>{r.error && <div className="muted small">{r.error}</div>}</td></tr>); })}</tbody>
      </table></div>
    </>
  );
}
