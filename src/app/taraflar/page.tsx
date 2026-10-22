import { DataToolbar } from "@/components/DataToolbar";
import { requireInternalPage } from "@/lib/session";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { ROLE_TYPE_LABELS } from "@/lib/labels";

export const metadata = { title: "Taraflar & tesisler" };

export default async function Parties() {
  await requireInternalPage();
  const parties = await db.select().from(s.parties).orderBy(asc(s.parties.kind), asc(s.parties.legalName));
  const roles = await db.select().from(s.partyRoles);
  const facilities = await db.select().from(s.facilities);
  const VER: Record<string, string> = { UNVERIFIED: "Doğrulanmadı", SOURCE_FOUND: "Kaynak bulundu", VERIFIED: "Doğrulandı" };
  return (
    <>
      <div className="pagehead"><div><h1>Taraflar ve tesisler</h1><div className="muted">Bir şirket birden fazla rol üstlenebilir; kurumlar tek bir "devlet" kaydında birleştirilmez.</div></div><DataToolbar entity="taraflar" reportHref="/analiz/rapor" extra={<a className="btn secondary" href="/api/disa-aktar/tesisler?withId=1" download>Tesisleri Excel'e aktar</a>} /></div>
      <div className="tablewrap" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Taraf</th><th>Tür</th><th>Roller</th><th>VKN</th><th>İletişim</th></tr></thead>
          <tbody>{parties.map((p) => (
            <tr key={p.id}><td><b>{p.legalName}</b> {p.isDemo && <span className="badge demo">ÖRNEK</span>}</td>
              <td>{p.kind === "AUTHORITY" ? "Kurum" : p.kind === "COMPANY" ? "Şirket" : "Kişi"}</td>
              <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{roles.filter((r) => r.partyId === p.id).map((r) => <span key={r.id} className="badge">{ROLE_TYPE_LABELS[r.role]}</span>)}</td>
              <td className="mono">{p.taxNumber ?? "—"}</td><td style={{ fontSize: 12.5 }}>{[p.phone, p.email, p.address].filter(Boolean).join(" · ") || "—"}</td></tr>))}
          </tbody>
        </table>
      </div>
      <h2>Tesisler</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Tesis</th><th>Tür</th><th>Koordinat</th><th>Doğrulama</th><th>Kaynak</th></tr></thead>
          <tbody>{facilities.map((f) => (
            <tr key={f.id}><td><b>{f.name}</b> {f.isDemo && <span className="badge demo">ÖRNEK</span>}</td><td>{f.type}</td>
              <td className="mono">{f.lat && f.lon ? `${f.lat}, ${f.lon}` : "—"}</td>
              <td><span className={`badge ${f.verification === "VERIFIED" ? "ok" : "warn"}`}>{VER[f.verification]}</span></td><td style={{ fontSize: 12.5 }}>{f.coordSource ?? "—"}</td></tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
