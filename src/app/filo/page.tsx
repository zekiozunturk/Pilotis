import { db, schema as s } from "@/db";
import { ASSET_LABELS, OPERATOR } from "@/data/catalog";
import { fmtNum } from "@/lib/format";

export const metadata = { title: "Filo" };

export default async function Fleet() {
  const assets = await db.select().from(s.fleetAssets);
  const order = ["TUG", "PILOT_BOAT", "MOORING_BOAT", "SURFACE_CLEANING_VESSEL"];
  return (
    <>
      <div className="pagehead"><div><h1>Filo</h1><div className="muted">Kaynak: <a href={`${OPERATOR.website}/filo/`} target="_blank" rel="noreferrer">yalovapilotaj.com/filo</a> · Araç sayısı sabit kodlanmaz.</div></div></div>
      <div className="alert warn" style={{ marginBottom: 16 }}><span>⚠</span><div><b>AK-01 · Teknik özellikler doğrulanmadı</b>Sitede 4 römorkör (Yalova 2–5) yayımlanıyor; şartname 7 römorkör öngörüyor. Çeki gücü, IMO/MMSI ve sertifikalar gelene kadar römorkör karar motoru bu araçları uygunluk hesabına almaz; değerler uydurulmaz.</div></div>
      {order.map((t) => {
        const list = assets.filter((a) => a.type === t);
        if (!list.length) return null;
        return (
          <section key={t} style={{ marginBottom: 24 }}>
            <h2>{ASSET_LABELS[t]} ({list.length})</h2>
            <div className="fleet">
              {list.map((a) => (
                <div className="item" key={a.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.photoUrl ? <img src={a.photoUrl} alt={a.name} loading="lazy" /> : <div style={{ height: 150, background: "var(--navy-100)" }} />}
                  <div className="b">
                    <div className="n">{a.name}</div>
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>
                      Çeki gücü: <b>{a.bollardPullT ? `${fmtNum(a.bollardPullT, 1)} t` : "—"}</b> · Boy: {a.loa ? `${fmtNum(a.loa, 1)} m` : "—"}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className={`badge ${a.available ? "ok" : "bad"}`}>{a.available ? "Kullanılabilir" : "Kullanım dışı"}</span>
                      <span className={`badge ${a.specVerified ? "ok" : "warn"}`}>{a.specVerified ? "Teknik dosya doğrulandı" : "Teknik dosya bekleniyor"}</span>
                    </div>
                    {a.sourceUrl && <div style={{ fontSize: 12, marginTop: 6 }}><a href={a.sourceUrl} target="_blank" rel="noreferrer">Kaynak sayfa ↗</a></div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
