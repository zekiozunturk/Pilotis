"use client";
/** Ortak filtre çubuğu — bütün analiz ekranlarını aynı dilimle süzer; durum URL'de tutulur (paylaşılabilir, sekme değişince korunur) */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type O = { v: string; l: string };
export interface FilterOptions { persons: O[]; roles: O[]; teams: O[]; assets: O[]; assetTypes: O[]; opTypes: O[]; vessels: O[]; parties: O[]; agents: O[]; facilities: O[]; finance: boolean; restrictedPeople: boolean }

const todayTR = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
function presets() {
  const t = todayTR(), y = t.slice(0, 4), m = Number(t.slice(5, 7));
  const prevM = m === 1 ? `${Number(y) - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const q0 = Math.floor((m - 1) / 3) * 3 + 1;
  return [
    { k: "bugun", l: "Bugün", bas: t, bit: t },
    { k: "7", l: "Son 7 gün", bas: addDays(t, -6), bit: t },
    { k: "30", l: "Son 30 gün", bas: addDays(t, -29), bit: t },
    { k: "90", l: "Son 90 gün", bas: addDays(t, -89), bit: t },
    { k: "ay", l: "Bu ay", bas: `${t.slice(0, 7)}-01`, bit: t },
    { k: "gecenay", l: "Geçen ay", bas: `${prevM}-01`, bit: addDays(`${t.slice(0, 7)}-01`, -1) },
    { k: "ceyrek", l: "Bu çeyrek", bas: `${y}-${String(q0).padStart(2, "0")}-01`, bit: t },
    { k: "yil", l: "Bu yıl", bas: `${y}-01-01`, bit: t },
  ];
}
const MULTI: { key: string; label: string; opt: keyof FilterOptions; fin?: boolean }[] = [
  { key: "personel", label: "Personel", opt: "persons" }, { key: "gorev", label: "Personel görevi", opt: "roles" }, { key: "ekip", label: "Ekip", opt: "teams" },
  { key: "arac", label: "Römorkör / araç", opt: "assets" }, { key: "sinif", label: "Araç sınıfı", opt: "assetTypes" }, { key: "tur", label: "Operasyon türü", opt: "opTypes" },
  { key: "gemi", label: "Gemi", opt: "vessels" }, { key: "musteri", label: "Müşteri / fatura muhatabı", opt: "parties" }, { key: "acente", label: "Acente", opt: "agents" }, { key: "tesis", label: "Tersane / tesis", opt: "facilities" },
];
const STATIC: { key: string; label: string; opts: O[]; fin?: boolean }[] = [
  { key: "vardiya", label: "Gündüz / gece", opts: [{ v: "DAY", l: "Gündüz" }, { v: "NIGHT", l: "Gece" }] },
  { key: "oncelik", label: "Görev niteliği", opts: [{ v: "NORMAL", l: "Normal görev" }, { v: "MANDATORY", l: "Zorunlu görev" }, { v: "EMERGENCY", l: "Acil müdahale" }] },
  { key: "durum", label: "İş emri durumu", opts: [{ v: "COMPLETED", l: "Tamamlandı" }, { v: "PARTIAL", l: "Kısmen" }, { v: "CANCELLED", l: "İptal" }, { v: "READY", l: "Planlı" }] },
  { key: "tahakkuk", label: "Tahakkuk", opts: [{ v: "APPROVED", l: "Onaylı" }, { v: "IN_REVIEW", l: "İncelemede" }, { v: "AWAITING_CALC", l: "Hesap bekliyor" }, { v: "DISPUTED", l: "İtirazlı" }], fin: true },
  { key: "muhasebe", label: "Fatura / tahsilat", opts: [{ v: "AWAITING_EXPORT", l: "Faturalanmadı" }, { v: "INVOICED", l: "Faturalandı" }, { v: "RECONCILED", l: "Tahsil edildi" }], fin: true },
];

export function FilterBar({ opts }: { opts: FilterOptions }) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const [pending, start] = useTransition();
  const [more, setMore] = useState(() => MULTI.some((m) => sp.get(m.key)) || STATIC.some((m) => sp.get(m.key)) || sp.get("iptal") === "1");
  const set = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) if (v == null || v === "") u.delete(k); else u.set(k, v);
    start(() => router.push(`${path}?${u.toString()}`, { scroll: false }));
  };
  const t = todayTR();
  const bas = sp.get("bas") ?? `${t.slice(0, 7)}-01`, bit = sp.get("bit") ?? t;
  const active = presets().find((p) => p.bas === bas && p.bit === bit)?.k;
  const activeCount = [...MULTI, ...STATIC].filter((m) => sp.get(m.key)).length + (sp.get("iptal") ? 1 : 0);
  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s" }} aria-busy={pending}>
      <div className="fbar" role="search" aria-label="Analiz filtreleri">
        <div><label>Tarih aralığı</label><div className="presets">{presets().map((p) => <button type="button" key={p.k} className={active === p.k ? "on" : ""} onClick={() => set({ bas: p.bas, bit: p.bit })}>{p.l}</button>)}</div></div>
        <div><label htmlFor="f-bas">Başlangıç</label><input id="f-bas" type="date" value={bas} onChange={(e) => set({ bas: e.target.value })} style={{ width: 140 }} /></div>
        <div><label htmlFor="f-bit">Bitiş</label><input id="f-bit" type="date" value={bit} onChange={(e) => set({ bit: e.target.value })} style={{ width: 140 }} /></div>
        <div><label htmlFor="f-grup">Gruplama</label><select id="f-grup" value={sp.get("grup") ?? "day"} onChange={(e) => set({ grup: e.target.value })}><option value="day">Gün</option><option value="week">Hafta</option><option value="month">Ay</option><option value="quarter">Çeyrek</option><option value="year">Yıl</option></select></div>
        <div><label htmlFor="f-esas">Tarih esası</label><select id="f-esas" value={sp.get("esas") ?? "SERVICE"} onChange={(e) => set({ esas: e.target.value })}><option value="SERVICE">Hizmet tarihi</option><option value="SHIFT">Vardiya tarihi</option>{opts.finance && <><option value="ACCRUAL">Tahakkuk tarihi</option><option value="INVOICE">Fatura tarihi</option><option value="COLLECTION">Tahsilat tarihi</option></>}</select></div>
        <div><label htmlFor="f-kars">Karşılaştırma</label><select id="f-kars" value={sp.get("kars") === "yok" ? "yok" : sp.get("kbas") ? "ozel" : "onceki"} onChange={(e) => set(e.target.value === "yok" ? { kars: "yok", kbas: null, kbit: null } : e.target.value === "onceki" ? { kars: null, kbas: null, kbit: null } : { kars: null, kbas: addDays(bas, -365), kbit: addDays(bit, -365) })}><option value="onceki">Önceki eşit dönem</option><option value="ozel">Seçilen dönem</option><option value="yok">Yok</option></select></div>
        {sp.get("kbas") && <><div><label htmlFor="f-kbas">Karş. başlangıç</label><input id="f-kbas" type="date" value={sp.get("kbas") ?? ""} onChange={(e) => set({ kbas: e.target.value })} style={{ width: 140 }} /></div><div><label htmlFor="f-kbit">Karş. bitiş</label><input id="f-kbit" type="date" value={sp.get("kbit") ?? ""} onChange={(e) => set({ kbit: e.target.value })} style={{ width: 140 }} /></div></>}
        <button type="button" className="btn secondary" onClick={() => setMore((x) => !x)} aria-expanded={more}>Diğer filtreler{activeCount ? ` (${activeCount})` : ""}</button>
        {activeCount > 0 && <button type="button" className="btn secondary" onClick={() => set(Object.fromEntries([...MULTI, ...STATIC].map((m) => [m.key, null]).concat([["iptal", null]])))}>Temizle</button>}
      </div>
      {more && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
          {MULTI.filter((m) => !(m.key === "personel" && opts.restrictedPeople && opts.persons.length <= 1)).map((m) => {
            const list = opts[m.opt] as O[];
            const sel = (sp.get(m.key) ?? "").split(",").filter(Boolean);
            return (
              <div key={m.key}>
                <label htmlFor={`f-${m.key}`} style={{ fontSize: 11, color: "var(--muted)" }}>{m.label}</label>
                <select id={`f-${m.key}`} multiple size={Math.min(4, Math.max(2, list.length))} value={sel} onChange={(e) => set({ [m.key]: [...e.target.selectedOptions].map((o) => o.value).join(",") || null })} style={{ width: "100%" }}>
                  {list.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            );
          })}
          {STATIC.filter((m) => !m.fin || opts.finance).map((m) => (
            <div key={m.key}>
              <label htmlFor={`f-${m.key}`} style={{ fontSize: 11, color: "var(--muted)" }}>{m.label}</label>
              {m.key === "vardiya"
                ? <select id={`f-${m.key}`} value={sp.get(m.key) ?? ""} onChange={(e) => set({ [m.key]: e.target.value || null })} style={{ width: "100%" }}><option value="">Tümü</option>{m.opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                : <select id={`f-${m.key}`} multiple size={Math.min(4, m.opts.length)} value={(sp.get(m.key) ?? "").split(",").filter(Boolean)} onChange={(e) => set({ [m.key]: [...e.target.selectedOptions].map((o) => o.value).join(",") || null })} style={{ width: "100%" }}>{m.opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>}
            </div>
          ))}
          {opts.finance && <div><label htmlFor="f-tah" style={{ fontSize: 11, color: "var(--muted)" }}>Tahsilat durumu</label><select id="f-tah" value={sp.get("tahsilat") ?? ""} onChange={(e) => set({ tahsilat: e.target.value || null })} style={{ width: "100%" }}><option value="">Tümü</option><option value="PAID">Tahsil edildi</option><option value="OPEN">Açık</option><option value="DISPUTED">İtirazlı</option></select></div>}
          <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={sp.get("iptal") === "1"} onChange={(e) => set({ iptal: e.target.checked ? "1" : null })} /> Yalnız iptal / tamamlanamayan</label>
          <div className="muted" style={{ gridColumn: "1 / -1", fontSize: 11.5 }}>Çoklu seçim için Ctrl/⌘ tuşunu basılı tutun. Filtreler bu sekmedeki ve diğer analiz sekmelerindeki bütün grafik, tablo ve dışa aktarımları birlikte süzer.</div>
        </div>
      )}
    </div>
  );
}
