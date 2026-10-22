import { requireInternalPage } from "@/lib/session";
import { db, schema as s } from "@/db";
import { STATUS_LABELS } from "@/data/catalog";
import { fmtDT } from "@/lib/format";
import { Simulator } from "./sim";
import Link from "next/link";
import { TARIFF_CATEGORIES } from "@/lib/tariff/category";

export const metadata = { title: "Tarife & hesap" };

export default async function Tariffs() {
  await requireInternalPage();
  const fams = await db.select().from(s.tariffFamilies);
  const vers = await db.select().from(s.tariffVersions);
  return (
    <>
      <div className="pagehead"><div><h1>Tarife aileleri ve hesap motoru</h1><div className="muted">Sürüm, yıl değil hizmet tarihine göre seçilir (R-009). Aynı girdi + aynı sürüm ⇒ aynı sonuç ve aynı doğrulama kimliği.</div></div></div>
      <div className="alert warn" style={{ marginBottom: 16 }}><span>⚠</span><div><b>Henüz yürürlükte onaylı tarife yok</b>KRP tablosu Petkim Rev.4 belgesinden aktarıldı (kaynak bulundu). 2026–2027 sürümü, resmî DGM duyurusundaki ABD TÜFE oranıyla türetilip onaylanana kadar hiçbir hesap üretim tahakkukuna dönüşmez.</div></div>
      <div className="toolbar" style={{ marginBottom: 12 }}><Link className="btn secondary" href="/tarife/karsilastir">Sürüm karşılaştır</Link></div>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        {fams.map((f) => {
          const vs = vers.filter((v) => v.familyId === f.id);
          return <div className="card" key={f.id}><h3>{f.name}</h3><div className="muted" style={{ fontSize: 12 }}>{f.kind}</div>
            {vs.length === 0 ? <div className="badge grey" style={{ marginTop: 8 }}>Sürüm yok</div> : vs.map((v) => (
              <div key={v.id} style={{ marginTop: 8, fontSize: 13 }}><Link href={`/tarife/${v.id}`}><b>{v.label}</b></Link><br />{fmtDT(v.validFrom)} – {fmtDT(v.validTo)} · {v.currency} · <span className="badge warn">{STATUS_LABELS[v.status]}</span> {v.isDemo && <span className="badge demo">ÖRNEK</span>}</div>))}
          </div>;
        })}
      </div>
      <Simulator versions={vers.filter((v) => v.status !== "REPEALED").map((v) => ({ id: v.id, label: `${v.label} · ${STATUS_LABELS[v.status]}`, adjustments: ((v.definition as { adjustments: { code: string; label: string }[] }).adjustments).map((a) => ({ code: a.code, label: a.label })), categorized: !!(v.definition as { categories?: object }).categories }))} categories={Object.entries(TARIFF_CATEGORIES)} />
    </>
  );
}
