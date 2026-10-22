import { db, schema as s } from "@/db";
import { DEMO_TARIFF, STATUS_LABELS } from "@/data/catalog";
import { fmtDT } from "@/lib/format";
import { Simulator } from "./sim";

export const metadata = { title: "Tarife & hesap" };

export default async function Tariffs() {
  const fams = await db.select().from(s.tariffFamilies);
  const vers = await db.select().from(s.tariffVersions);
  return (
    <>
      <div className="pagehead"><div><h1>Tarife aileleri ve hesap motoru</h1><div className="muted">Sürüm, yıl değil hizmet tarihine göre seçilir (R-009). Aynı girdi + aynı sürüm ⇒ aynı sonuç ve aynı doğrulama kimliği.</div></div></div>
      <div className="alert warn" style={{ marginBottom: 16 }}><span>⚠</span><div><b>Yüklü tarife ÖRNEK yapıdadır</b>Bakanlığın 01.02.2026–31.01.2027 ücret tablosundaki resmî rakamlar girilip tarife sorumlusu ve işletme yöneticisi tarafından onaylanana kadar hiçbir hesap üretim tahakkukuna dönüşmez.</div></div>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        {fams.map((f) => {
          const vs = vers.filter((v) => v.familyId === f.id);
          return <div className="card" key={f.id}><h3>{f.name}</h3><div className="muted" style={{ fontSize: 12 }}>{f.kind}</div>
            {vs.length === 0 ? <div className="badge grey" style={{ marginTop: 8 }}>Sürüm yok</div> : vs.map((v) => (
              <div key={v.id} style={{ marginTop: 8, fontSize: 13 }}><b>{v.label}</b><br />{fmtDT(v.validFrom)} – {fmtDT(v.validTo)} · {v.currency} · <span className="badge warn">{STATUS_LABELS[v.status]}</span> {v.isDemo && <span className="badge demo">ÖRNEK</span>}</div>))}
          </div>;
        })}
      </div>
      <Simulator adjustments={DEMO_TARIFF.definition.adjustments.map((a) => ({ code: a.code, label: a.label }))} />
    </>
  );
}
