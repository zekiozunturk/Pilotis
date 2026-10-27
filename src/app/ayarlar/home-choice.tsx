import { setHomeDefault, setHomeVariant } from "./home-actions";
import { HOME_LABEL, type HomeVariant } from "@/lib/home-variant";

const DESC: Record<HomeVariant, string> = {
  CLASSIC: "Göstergeler, karar bekleyen talepler, son iş emirleri ve görevdeki ekipler.",
  MAP: "Üstte iki canlı harita: solda bölgedeki gemi trafiği (AIS), sağda filomuz — kaptan adı, hizmet verilen gemi, görevde kırmızı / boşta beyaz bayrak. Altında klasik kokpitin tamamı.",
};
function Preview({ v }: { v: HomeVariant }) {
  return (
    <div className={`hv-prev ${v === "MAP" ? "map" : ""}`} aria-hidden>
      {v === "MAP" && <div className="hv-maps"><span className="sea"><i /><i /><i /></span><span className="sea fleet"><i className="w" /><i className="r" /><i className="w" /></span></div>}
      <div className="hv-kpi"><i /><i /><i /><i /></div>
      <div className="hv-rows"><i /><i /><i /></div>
    </div>
  );
}
export function HomeChoice({ personal, corporate, canSetDefault }: { personal: HomeVariant | null; corporate: HomeVariant; canSetDefault: boolean }) {
  const current = personal ?? corporate;
  return (
    <div className="card">
      <h2>Ana sayfa görünümü</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Giriş yaptığınızda açılan kokpiti seçin. Seçim yalnız sizin için geçerlidir{personal ? "" : ` — şu an kurum varsayılanı (${HOME_LABEL[corporate]}) kullanılıyor`}.</p>
      <div className="hv-grid">
        {(["CLASSIC", "MAP"] as HomeVariant[]).map((v) => (
          <form key={v} action={setHomeVariant} className={`hv-opt ${current === v ? "on" : ""}`}>
            <input type="hidden" name="variant" value={v} />
            <Preview v={v} />
            <div><b>{HOME_LABEL[v]}</b>{current === v && <span className="badge ok" style={{ marginLeft: 6 }}>Kullanılıyor</span>}</div>
            <div className="muted small">{DESC[v]}</div>
            <button className={`btn ${current === v ? "secondary" : "orange"}`} disabled={current === v && !!personal}>{current === v && personal ? "Seçili" : "Bunu kullan"}</button>
          </form>
        ))}
      </div>
      {personal && <form action={setHomeVariant} style={{ marginTop: 8 }}><input type="hidden" name="variant" value="" /><button className="btn secondary sm">Kurum varsayılanına dön ({HOME_LABEL[corporate]})</button></form>}
      {canSetDefault && (
        <form action={setHomeDefault} className="toolbar" style={{ marginTop: 12, alignItems: "center" }}>
          <span className="small muted">Kurum varsayılanı (kişisel seçim yapmayanlar için):</span>
          <select name="variant" defaultValue={corporate} style={{ width: 180 }} aria-label="Kurum varsayılan ana sayfası">
            <option value="CLASSIC">{HOME_LABEL.CLASSIC}</option><option value="MAP">{HOME_LABEL.MAP}</option>
          </select>
          <button className="btn secondary sm">Kaydet</button>
        </form>
      )}
    </div>
  );
}
