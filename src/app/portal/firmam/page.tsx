import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope, ROLE_LABELS } from "@/lib/session";
import { fmtDT } from "@/lib/format";
import { FirmForm, InviteForm } from "./form";
import { toggleFirmUser } from "./actions";
import { currentUser } from "@/lib/session";
import type { Role } from "@/lib/workflow";
export const metadata = { title: "Firma bilgilerim" };
export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { ACTIVE: ["Doğrulanmış cari", "ok"], PENDING_REVIEW: ["Doğrulama bekliyor", "warn"], SUSPENDED: ["Askıda", "bad"] };
export default async function Firmam() {
  const scope = await currentScope();
  if (!scope.external || !scope.partyId) return <div className="card"><h1>Firma bilgilerim</h1><p className="muted">Bu sayfa müşteri hesapları içindir.</p></div>;
  const [p] = await db.select().from(s.parties).where(eq(s.parties.id, scope.partyId));
  const users = await db.select().from(s.users).where(eq(s.users.partyId, p.id));
  const me = await currentUser();
  const isAdmin = !!users.find((x) => x.id === me?.id)?.partyAdmin || !!me?.roles.includes("SYSTEM_ADMIN");
  const [stl, stc] = ST[p.registrationStatus] ?? [p.registrationStatus, "grey"];
  return (
    <>
      <div className="pagehead"><div><h1>Firma bilgilerim</h1><div className="muted">Fatura bu bilgilerle TL olarak kesilir.</div></div><span className={`badge ${stc}`}>{stl}</span></div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Cari kimlik</h2>
          <table><tbody>
            <tr><th>Unvan</th><td><b>{p.legalName}</b></td></tr><tr><th>Vergi no</th><td className="mono">{p.taxNumber ?? "—"}</td></tr>
            <tr><th>Ülke</th><td>{p.country ?? "—"}</td></tr><tr><th>Kayıt</th><td className="small">{fmtDT(p.createdAt)}</td></tr>
          </tbody></table>
          <p className="muted small">Unvan ve vergi numarası değişikliği için belge ile Yalova Pilotaj muhasebesine başvurun; kesilmiş faturalar değiştirilmez.</p>
          <h2 style={{ marginTop: 16 }}>Firma kullanıcıları</h2>
          <table><tbody>{users.map((u) => <tr key={u.id}>
            <td><b>{u.name}</b>{u.partyAdmin && <> <span className="badge">firma yetkilisi</span></>}<div className="muted small">{u.title ?? ""} · {u.username}</div></td>
            <td className="small">{u.email}<div className="muted">{(u.roles as Role[]).includes("BILLING_PARTY") ? "Muhatap onayı verebilir" : "Yalnız talep"}</div></td>
            <td>{!u.active ? <span className="badge grey">Kapalı</span> : !u.passwordHash ? <span className="badge warn">Davet bekliyor</span> : <span className="badge ok">Aktif</span>}</td>
            <td>{isAdmin && u.id !== me?.id && <form action={toggleFirmUser}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="act" value={u.active ? "off" : "on"} /><button className="btn secondary">{u.active ? "Kapat" : "Aç"}</button></form>}</td>
          </tr>)}</tbody></table>
        </div>
        <div className="card"><h2>İletişim ve fatura bilgileri</h2><FirmForm p={p} /></div>
      </div>
      {isAdmin ? <div className="card" style={{ marginTop: 16 }} id="kullanici-ekle"><h2>Firmama kullanıcı ekle</h2><InviteForm /></div>
        : <p className="muted small" style={{ marginTop: 12 }}>Firmanıza kullanıcı eklemek için firma yetkilinize başvurun.</p>}
    </>
  );
}
