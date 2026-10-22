import { asc, gt, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDT } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/session";
import { requireAdmin } from "../_guard";
import { userAction } from "../actions";
import { NewUserForm } from "./new-user";
import type { Role } from "@/lib/workflow";

export const metadata = { title: "Kullanıcılar" };
export const dynamic = "force-dynamic";

export default async function Kullanicilar() {
  const me = await requireAdmin();
  const users = await db.select().from(s.users).orderBy(asc(s.users.username));
  const parties = await db.select({ id: s.parties.id, n: s.parties.legalName }).from(s.parties).orderBy(asc(s.parties.legalName));
  const people = await db.select({ id: s.personnel.id, n: s.personnel.fullName, t: s.personnel.title }).from(s.personnel).orderBy(asc(s.personnel.fullName));
  const live = new Set((await db.select({ u: s.sessions.userId }).from(s.sessions).where(gt(s.sessions.expiresAt, new Date()))).map((x) => x.u));
  const now = Date.now();
  void sql;
  return (
    <>
      <div className="pagehead"><div><h1>Kullanıcılar ve roller</h1><div className="muted">Rol, kullanıcının açılış ekranını ve yetkilerini belirler. Müşteri kullanıcısı bir firmaya; saha kullanıcısı bir personel kaydına bağlanır.</div></div></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Bağlı kayıt</th><th>Son giriş</th><th>Durum</th><th>İşlem</th></tr></thead>
        <tbody>{users.map((u) => {
          const locked = u.lockedUntil && u.lockedUntil.getTime() > now;
          return (
            <tr key={u.id}>
              <td><b className="mono">{u.username ?? "—"}</b>{u.isDemo && <> <span className="badge demo">SUNUM</span></>}<div className="small">{u.name}</div><div className="muted small">{u.email}</div></td>
              <td>{(u.roles as Role[]).map((r) => <div key={r} className="small">{ROLE_LABELS[r]}</div>)}</td>
              <td className="small">{parties.find((p) => p.id === u.partyId)?.n ?? people.find((p) => p.id === u.personnelId)?.n.replace("ÖRNEK ", "") ?? <span className="muted">—</span>}</td>
              <td className="small">{u.lastLoginAt ? fmtDT(u.lastLoginAt) : <span className="muted">hiç</span>}</td>
              <td>{!u.active ? <span className="badge grey">Kapalı</span> : locked ? <span className="badge bad">Kilitli</span> : live.has(u.id) ? <span className="badge ok">Çevrimiçi</span> : <span className="badge">Aktif</span>}{u.mustChangePassword && <div className="muted small">şifre değişmeli</div>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <div className="toolbar" style={{ gap: 4 }}>
                  {u.id !== me.id && <form action={userAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="act" value={u.active ? "deactivate" : "activate"} /><button className="btn secondary">{u.active ? "Kapat" : "Aç"}</button></form>}
                  {locked && <form action={userAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="act" value="unlock" /><button className="btn secondary">Kilidi aç</button></form>}
                  {live.has(u.id) && u.id !== me.id && <form action={userAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="act" value="logout" /><button className="btn secondary">Oturumu kapat</button></form>}
                </div>
                <details><summary className="small">Şifre sıfırla</summary>
                  <form action={userAction} className="toolbar" style={{ gap: 4, marginTop: 4 }}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="act" value="reset" /><input name="password" type="text" placeholder="Geçici şifre (8+, harf+rakam)" aria-label="Geçici şifre" style={{ width: 200 }} /><button className="btn secondary">Sıfırla</button></form>
                </details>
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="card" style={{ marginTop: 16 }} id="yeni">
        <h2>Yeni kullanıcı</h2>
        <NewUserForm roles={Object.entries(ROLE_LABELS).map(([v, l]) => ({ v, l }))} parties={parties.map((p) => ({ v: p.id, l: p.n }))} people={people.map((p) => ({ v: p.id, l: `${p.n.replace("ÖRNEK ", "")} — ${p.t}` }))} />
      </div>
    </>
  );
}
