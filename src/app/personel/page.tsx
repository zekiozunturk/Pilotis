import { DataToolbar } from "@/components/DataToolbar";
import { requireInternalPage } from "@/lib/session";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import Link from "next/link";
import { profileByCode } from "@/lib/planning/profiles";

export const metadata = { title: "Personel" };

export default async function Personnel() {
  await requireInternalPage();
  const rows = await db.select().from(s.personnel).orderBy(asc(s.personnel.unit), asc(s.personnel.title));
  return (
    <>
      <div className="pagehead"><div><h1>Personel</h1><div className="muted">Başlangıç ekip şablonu: kaptan, başçarkçı, yağcı, pimci — resmî asgari donatım karşılığı doğrulanana kadar yasal asgari kadro sayılmaz.</div></div><DataToolbar entity="personel" reportHref="/analiz/personel" /></div>
      <div className="alert info" style={{ marginBottom: 16 }}><span>🔒</span><div><b>KVKK — R-017</b>Kan grubu gibi sağlık verileri ayrı tabloda tutulur, genel listelerde gösterilmez; erişim yalnız yetkili rollerle ve kayıt altında yapılır.</div></div>
      <div className="alert warn" style={{ marginBottom: 16 }}><span>⚠</span><div><b>AK-09</b>Gerçek personel listesi, unvanlar ve yeterlik belgeleri bekleniyor. Aşağıdakiler örnek kayıtlardır.</div></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Ad</th><th>Görev</th><th>Birim</th><th>Çalışma profili</th><th>Durum</th></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id}><td><Link href={`/personel/${p.id}`}><b>{p.fullName}</b></Link> {p.isDemo && <span className="badge demo">ÖRNEK</span>}</td><td>{p.title}</td><td>{p.unit ?? "—"}</td><td style={{ fontSize: 12 }}>{profileByCode(p.workProfile).name}</td><td><span className={`badge ${p.active ? "ok" : "grey"}`}>{p.active ? "Aktif" : "Pasif"}</span></td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
