import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser, ROLE_LABELS } from "@/lib/session";
import { fmtDT } from "@/lib/format";
import { PasswordForm, PrefsForm } from "./form";
import type { Role } from "@/lib/workflow";

export const metadata = { title: "Hesabım" };
export const dynamic = "force-dynamic";
export default async function Hesabim() {
  const u = await requireUser();
  const [row] = await db.select().from(s.users).where(eq(s.users.id, u.id));
  const sessions = await db.select().from(s.sessions).where(eq(s.sessions.userId, u.id)).orderBy(desc(s.sessions.lastSeenAt));
  const party = u.partyId ? (await db.select().from(s.parties).where(eq(s.parties.id, u.partyId)))[0] : null;
  return (
    <>
      <div className="pagehead"><div><h1>Hesabım</h1><div className="muted">Kişisel bilgiler, şifre ve açık oturumlar.</div></div></div>
      {u.mustChangePassword && <div className="alert bad" role="alert" style={{ marginBottom: 16 }}><span>🔒</span><div><b>Şifrenizi değiştirmeniz gerekiyor</b>Geçici şifreyle giriş yaptınız. Kendi şifrenizi belirleyene kadar diğer ekranlar açılmaz.</div></div>}
      <div className="grid2">
        <div className="card">
          <h2>Bilgilerim</h2>
          <table><tbody>
            <tr><th>Ad soyad</th><td>{u.name}</td></tr><tr><th>Kullanıcı adı</th><td className="mono">{u.username}</td></tr><tr><th>E-posta</th><td>{u.email}</td></tr>
            <tr><th>Unvan</th><td>{u.title ?? "—"}</td></tr><tr><th>Rol</th><td>{(u.roles as Role[]).map((r) => ROLE_LABELS[r]).join(", ")}</td></tr>
            {party && <tr><th>Firma</th><td>{party.legalName}</td></tr>}
          </tbody></table>
          {u.isDemo && <p className="muted small">Bu bir sunum hesabıdır (şifre 123456). Canlı kullanımda sunum hesapları kapatılır.</p>}
        </div>
        <div className="card"><h2>Şifre değiştir</h2><PasswordForm /></div>
      </div>
      <div className="card" style={{ marginTop: 16 }} id="bildirim">
        <h2>Bildirim tercihlerim</h2>
        <PrefsForm email={u.email} notifyEmail={row.notifyEmail} notifySms={row.notifySms} phone={row.phone} />
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Açık oturumlarım</h2>
        <table><thead><tr><th>Başlangıç</th><th>Son görülme</th><th>Cihaz</th><th>IP</th></tr></thead><tbody>
          {sessions.map((x) => <tr key={x.id}><td className="small">{fmtDT(x.createdAt)}</td><td className="small">{fmtDT(x.lastSeenAt)}</td><td className="small muted">{(x.userAgent ?? "").slice(0, 70)}</td><td className="mono small">{x.ip ?? "—"}</td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
