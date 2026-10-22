import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope, ROLE_LABELS } from "@/lib/session";
import { fmtDT } from "@/lib/format";
import { FirmForm } from "./form";
import type { Role } from "@/lib/workflow";
export const metadata = { title: "Firma bilgilerim" };
export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = { ACTIVE: ["Doğrulanmış cari", "ok"], PENDING_REVIEW: ["Doğrulama bekliyor", "warn"], SUSPENDED: ["Askıda", "bad"] };
export default async function Firmam() {
  const scope = await currentScope();
  if (!scope.external || !scope.partyId) return <div className="card"><h1>Firma bilgilerim</h1><p className="muted">Bu sayfa müşteri hesapları içindir.</p></div>;
  const [p] = await db.select().from(s.parties).where(eq(s.parties.id, scope.partyId));
  const users = await db.select().from(s.users).where(eq(s.users.partyId, p.id));
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
          <table><tbody>{users.map((u) => <tr key={u.id}><td><b>{u.name}</b><div className="muted small">{u.title ?? ""}</div></td><td className="small">{u.email}</td><td className="small">{(u.roles as Role[]).map((r) => ROLE_LABELS[r]).join(", ")}</td></tr>)}</tbody></table>
        </div>
        <div className="card"><h2>İletişim ve fatura bilgileri</h2><FirmForm p={p} /></div>
      </div>
    </>
  );
}
