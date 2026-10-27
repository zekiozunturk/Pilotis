import Link from "next/link";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDT } from "@/lib/format";
import { requireAdmin } from "./_guard";
import { APP_VERSION } from "@/lib/version";
import { partyAction } from "./actions";

export const metadata = { title: "Sistem yönetimi" };
export const dynamic = "force-dynamic";
const ACT: Record<string, string> = { LOGIN: "Giriş", LOGIN_FAILED: "Hatalı giriş", LOGOUT: "Çıkış", USER_CREATE: "Kullanıcı oluşturuldu", USER_RESET: "Şifre sıfırlandı", USER_DEACTIVATE: "Kullanıcı kapatıldı", USER_ACTIVATE: "Kullanıcı açıldı", USER_UNLOCK: "Kilit açıldı", USER_LOGOUT: "Oturumlar kapatıldı", REGISTER: "Müşteri kaydı" };

export default async function Yonetim() {
  await requireAdmin();
  const now = new Date();
  const [{ users }] = await db.select({ users: sql<number>`count(*)::int` }).from(s.users).where(eq(s.users.active, true));
  const [{ sess }] = await db.select({ sess: sql<number>`count(distinct ${s.sessions.userId})::int` }).from(s.sessions).where(gt(s.sessions.expiresAt, now));
  const [{ locked }] = await db.select({ locked: sql<number>`count(*)::int` }).from(s.users).where(gt(s.users.lockedUntil, now));
  const pending = await db.select().from(s.parties).where(eq(s.parties.registrationStatus, "PENDING_REVIEW")).orderBy(desc(s.parties.createdAt));
  const pendingUsers = pending.length ? await db.select().from(s.users).where(inArray(s.users.partyId, pending.map((p) => p.id))) : [];
  const auth = await db.select().from(s.auditLog).where(inArray(s.auditLog.entity, ["auth", "user", "party"])).orderBy(desc(s.auditLog.at)).limit(15);
  const [{ dbsize }] = (await db.execute(sql`select pg_size_pretty(pg_database_size(current_database())) as dbsize`)).rows as { dbsize: string }[];
  const [{ failed24 }] = await db.select({ failed24: sql<number>`count(*)::int` }).from(s.auditLog).where(and(eq(s.auditLog.action, "LOGIN_FAILED"), gt(s.auditLog.at, new Date(now.getTime() - 864e5))));
  return (
    <>
      <div className="pagehead">
        <div><h1>Sistem yönetimi</h1><div className="muted">Kullanıcılar, müşteri kayıtları, oturum güvenliği ve sistem durumu · PILOTIS v{APP_VERSION}</div></div>
        <div className="toolbar"><Link className="btn orange" href="/yonetim/kullanicilar">Kullanıcıları yönet</Link><Link className="btn" href="/yonetim/oturumlar">Oturum kayıtları</Link><Link className="btn secondary" href="/yonetim/bildirimler">E-posta ve SMS</Link><Link className="btn secondary" href="/ayarlar/tema">Tema Stüdyosu</Link><Link className="btn secondary" href="/aktarim">Excel aktarım</Link></div>
      </div>
      <div className="tiles" style={{ marginBottom: 16 }}>
        <Link href="/yonetim/kullanicilar" className="tile"><div className="l">Aktif kullanıcı</div><div className="v">{users}</div></Link>
        <Link href="/yonetim/oturumlar?durum=acik" className="tile"><div className="l">Şu an oturumu açık</div><div className="v">{sess}</div><div className="d">Oturum kayıtları ›</div></Link>
        <div className="tile"><div className="l">Onay bekleyen müşteri kaydı</div><div className="v">{pending.length}</div>{pending.length > 0 && <div className="d down">İnceleyin</div>}</div>
        <div className="tile"><div className="l">Kilitli hesap · son 24 sa hatalı giriş</div><div className="v">{locked} · {failed24}</div></div>
        <div className="tile"><div className="l">Veritabanı boyutu</div><div className="v">{dbsize}</div><div className="d">Yedekleme durumu yedekleme modülüyle gelecek</div></div>
      </div>
      <div className="grid2">
        <div className="card">
          <h2>Müşteri kayıtları</h2>
          {pending.length === 0 ? <div className="empty">Onay bekleyen kayıt yok.</div> : (
            <table><thead><tr><th>Firma</th><th>Vergi</th><th>Yetkili</th><th>Tarih</th><th></th></tr></thead><tbody>
              {pending.map((p) => { const u = pendingUsers.find((x) => x.partyId === p.id); return (
                <tr key={p.id}>
                  <td><b>{p.legalName}</b><div className="muted small">{p.city ?? ""} {p.email ?? ""}</div></td>
                  <td className="mono small">{p.taxNumber ?? "—"}<div className="muted">{p.taxOffice ?? ""}</div></td>
                  <td className="small">{u?.name}<div className="muted">{u?.title} · {u?.username}</div></td>
                  <td className="small">{fmtDT(p.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <form action={partyAction} style={{ display: "inline" }}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="ACTIVE" /><button className="btn orange">Cariyi onayla</button></form>{" "}
                    <form action={partyAction} style={{ display: "inline" }}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="SUSPENDED" /><button className="btn danger">Askıya al</button></form>
                  </td>
                </tr>); })}
            </tbody></table>
          )}
          <p className="muted small">Portaldan kayıt olan firma talep oluşturabilir; talepler cari onaylanana kadar “cari onayı bekliyor” işaretiyle planlamaya düşer.</p>
        </div>
        <div className="card">
          <h2>Son güvenlik olayları <Link href="/yonetim/oturumlar" className="small" style={{ fontWeight: 400 }}>tüm oturum kayıtları ›</Link></h2>
          <table><tbody>{auth.map((a) => <tr key={a.id}><td className="small" style={{ whiteSpace: "nowrap" }}>{fmtDT(a.at)}</td><td><span className={`badge ${a.action === "LOGIN_FAILED" ? "bad" : "grey"}`}>{ACT[a.action] ?? a.action}</span></td><td className="mono small">{a.actorId}</td></tr>)}</tbody></table>
        </div>
      </div>
    </>
  );
}
