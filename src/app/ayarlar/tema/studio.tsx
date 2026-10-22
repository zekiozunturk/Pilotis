"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { THEMES, ACCENTS, PREF_LABEL, DEFAULT_PREFS, resolvePrefs, type UiPrefs, type PrefKey, type UiPolicy } from "@/lib/ui-prefs";
import { applyPrefs, readDevice, writeDevice } from "@/components/ui-apply";
import { savePersonal, resetPersonal, saveCorporate, saveRoleDefault, type TState } from "./actions";
import { Columns } from "@/components/charts";

const OPTS: Partial<Record<PrefKey, { v: string; l: string }[]>> = {
  appearance: [{ v: "light", l: "Açık" }, { v: "dark", l: "Koyu" }, { v: "system", l: "Sistem" }],
  font: [{ v: "s", l: "Küçük" }, { v: "m", l: "Standart" }, { v: "l", l: "Büyük" }, { v: "xl", l: "Çok büyük" }],
  density: [{ v: "comfortable", l: "Rahat" }, { v: "standard", l: "Standart" }, { v: "compact", l: "Sıkışık" }],
  radius: [{ v: "theme", l: "Tema varsayılanı" }, { v: "sharp", l: "Keskin" }, { v: "soft", l: "Yumuşak" }, { v: "round", l: "Yuvarlak" }],
  side: [{ v: "narrow", l: "Dar (simgeler)" }, { v: "standard", l: "Standart" }, { v: "wide", l: "Geniş" }],
  motion: [{ v: "full", l: "Tam" }, { v: "reduced", l: "Azaltılmış" }, { v: "none", l: "Kapalı" }],
  chart: [{ v: "theme", l: "Doğrulanmış (tema)" }, { v: "contrast", l: "Yüksek kontrast" }],
  map: [{ v: "theme", l: "Tema" }, { v: "light", l: "Açık" }, { v: "dark", l: "Koyu" }],
};
const SWATCH: Record<string, string[]> = { maritime: ["#061a40", "#0b2d6b", "#14b8c8", "#ffffff"], arctic: ["#eef4f9", "#2f6f9f", "#e8f2fa", "#ffffff"], midnight: ["#060a12", "#111827", "#5aa9e6", "#e0874f"], copper: ["#0a0a0b", "#18181a", "#c27a4a", "#ece7e1"], nordic: ["#efebe3", "#fdfcf9", "#1f4d3a", "#8a857c"], steel: ["#1b2430", "#e7eaee", "#1d3557", "#f2a900"], ocean: ["#003a52", "#c3e3f1", "#006d8f", "#ffffff"], radar: ["#020c08", "#08201a", "#2bd67b", "#22d3ee"], ivory: ["#2b1f16", "#fffdf8", "#3b2a1e", "#a8742c"], contrast: ["#000000", "#ffffff", "#0a3a8c", "#b33c00"] };

export function Studio({ prefs, personal, policy, role, roles, isAdmin }: { prefs: UiPrefs; personal: Partial<UiPrefs>; policy: UiPolicy; role: string; roles: { v: string; l: string }[]; isAdmin: boolean }) {
  const [p, setP] = useState<UiPrefs>(prefs);
  const [device, setDevice] = useState<Partial<UiPrefs>>({});
  const [msg, setMsg] = useState<TState>(null);
  const [locked, setLocked] = useState<PrefKey[]>(policy.locked);
  const [targetRole, setTargetRole] = useState("PILOT");
  const [pending, start] = useTransition();
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = readDevice(); setDevice(d); setP(resolvePrefs(policy, role, personal, d)); }, [policy, role, personal]);
  const upd = (patch: Partial<UiPrefs>) => { const n = { ...p, ...patch }; setP(n); applyPrefs(n); setMsg(null); };
  const theme = THEMES.find((t) => t.id === p.theme)!;
  const source = (k: PrefKey) => (device[k] !== undefined && !policy.locked.includes(k) ? "cihaz" : personal[k] !== undefined && !policy.locked.includes(k) ? "kişisel" : policy.roles[role]?.[k] !== undefined ? "rol" : policy.corporate[k] !== undefined ? "kurumsal" : "sistem");
  const lockedNow = (k: PrefKey) => policy.locked.includes(k) && !isAdmin;
  const diff = (base: UiPrefs) => Object.fromEntries(Object.entries(p).filter(([k, v]) => base[k as PrefKey] !== v)) as Partial<UiPrefs>;
  const sel = (k: PrefKey) => (
    <div key={k}>
      <label htmlFor={`s-${k}`}>{PREF_LABEL[k]} <span className="muted" style={{ fontWeight: 400 }}>· {source(k)}{policy.locked.includes(k) ? " · 🔒 kurumsal" : ""}</span></label>
      <select id={`s-${k}`} value={String(p[k])} disabled={lockedNow(k) || (k === "appearance" && theme.modes.length < 2)} onChange={(e) => upd({ [k]: e.target.value } as Partial<UiPrefs>)}>
        {OPTS[k]!.map((o) => <option key={o.v} value={o.v} disabled={k === "appearance" && o.v !== "system" && !(theme.modes as readonly string[]).includes(o.v)}>{o.l}</option>)}
      </select>
      {k === "appearance" && theme.modes.length < 2 && <div className="muted" style={{ fontSize: 11 }}>{theme.name} yalnız {theme.modes[0] === "dark" ? "koyu" : "açık"} görünümle gelir</div>}
    </div>
  );
  const chk = (k: "touch" | "reducedMotion" | "perf", note: string) => (
    <label className="check" key={k} title={note}><input type="checkbox" checked={p[k]} disabled={lockedNow(k)} onChange={(e) => upd({ [k]: e.target.checked })} /> {PREF_LABEL[k]} <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>· {note}</span></label>
  );
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", alignItems: "start" }}>
      <div className="card" style={{ position: "sticky", top: 70 }}>
        <h3>Tema</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }} role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={p.theme === t.id} disabled={lockedNow("theme")} onClick={() => upd({ theme: t.id })}
              style={{ textAlign: "left", border: p.theme === t.id ? "2px solid var(--orange)" : "1px solid var(--border)", borderRadius: 10, padding: 8, background: "var(--surface-2)", color: "var(--text)", cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>{SWATCH[t.id].map((c, i) => <span key={i} style={{ flex: 1, height: 18, background: c, borderRadius: 3, border: "1px solid rgba(128,128,128,.25)" }} />)}</div>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{t.name}</div>
              <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.3 }}>{t.modes.map((m) => (m === "dark" ? "koyu" : "açık")).join(" + ")}</div>
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12, margin: "8px 0" }}>{theme.desc}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {sel("appearance")}
          <div>
            <label htmlFor="s-accent">{PREF_LABEL.accent} <span className="muted" style={{ fontWeight: 400 }}>· {source("accent")}</span></label>
            <div style={{ display: "flex", gap: 4 }}><select id="s-accent" value={ACCENTS.some((a) => a.v === p.accent) ? p.accent : "custom"} disabled={lockedNow("accent")} onChange={(e) => e.target.value !== "custom" && upd({ accent: e.target.value })} style={{ flex: 1 }}>{ACCENTS.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}<option value="custom">Özel…</option></select><input type="color" aria-label="Özel vurgu rengi" value={p.accent || "#e8501a"} disabled={lockedNow("accent")} onChange={(e) => upd({ accent: e.target.value })} style={{ width: 44, padding: 2 }} /></div>
          </div>
          {sel("font")}{sel("density")}{sel("radius")}{sel("side")}{sel("motion")}{sel("chart")}{sel("map")}
        </div>
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {chk("touch", "saha tableti / eldivenle kullanım")}{chk("reducedMotion", "bütün geçişleri kapatır")}{chk("perf", "cam, gölge ve degradeyi kapatır; düşük donanım için")}
        </div>
        <div className="alert info" style={{ marginTop: 10, fontSize: 12 }}><span>ⓘ</span><div>Emniyet durumlarının anlamı temayla değişmez: kritik uyarılar her temada simge, başlık ve açıklamayla gösterilir; renk tek başına bilgi taşımaz.</div></div>
        <div className="sep" />
        <div className="toolbar">
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { setMsg(await savePersonal(diff(resolvePrefs(policy, role, {}, {})))); writeDevice(null); setDevice({}); })}>Kişisel tercih olarak kaydet</button>
          <button type="button" className="btn secondary" onClick={() => { const d = diff(resolvePrefs(policy, role, personal, {})); writeDevice(d); setDevice(d); setMsg({ ok: true, message: "Bu cihaza özel kaydedildi (yalnız bu tarayıcıda geçerli)" }); }}>Bu cihaza özel kaydet</button>
          <button type="button" className="btn secondary" onClick={() => { writeDevice(null); setDevice({}); const n = resolvePrefs(policy, role, personal, {}); setP(n); applyPrefs(n); setMsg({ ok: true, message: "Cihaz tercihi temizlendi" }); }}>Cihaz tercihini temizle</button>
          <button type="button" className="btn secondary" disabled={pending} onClick={() => start(async () => { setMsg(await resetPersonal()); writeDevice(null); setDevice({}); const n = resolvePrefs(policy, role, {}, {}); setP(n); applyPrefs(n); })}>Varsayılana dön</button>
        </div>
        {isAdmin && (
          <>
            <div className="sep" />
            <h3>Yönetici — rol ve kurumsal seviye</h3>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}><label htmlFor="s-role">Rol</label><select id="s-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>{roles.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
              <button type="button" className="btn secondary" disabled={pending} onClick={() => start(async () => setMsg(await saveRoleDefault(targetRole, diff(DEFAULT_PREFS))))}>Rol başlangıç tercihi yap</button>
            </div>
            <div style={{ marginTop: 10 }}><label>Kullanıcıların değiştiremeyeceği (kilitli) alanlar</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>{(Object.keys(PREF_LABEL) as PrefKey[]).map((k) => <label key={k} className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={locked.includes(k)} onChange={(e) => setLocked((l) => (e.target.checked ? [...l, k] : l.filter((x) => x !== k)))} /> {PREF_LABEL[k]}</label>)}</div>
            </div>
            <button type="button" className="btn orange" style={{ marginTop: 8 }} disabled={pending} onClick={() => start(async () => setMsg(await saveCorporate(diff(DEFAULT_PREFS), locked)))}>Kurumsal varsayılan yap ve izinleri kaydet</button>
          </>
        )}
        {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`} role="status" style={{ marginTop: 10 }}><span>{msg.ok ? "✓" : "⚠"}</span><div>{msg.message}</div></div>}
      </div>

      <div style={{ display: "grid", gap: 14 }} aria-label="Canlı önizleme">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>İş emri · OP-2026-000142</h2><span className="badge ok">✓ Tamamlandı</span></div>
          <div className="muted" style={{ fontSize: 12.5, margin: "4px 0 10px" }}>ÖRNEK AURORA · Yanaşma · ÖRNEK Tersane rıhtımı · R1, R2</div>
          <div className="statusrow">{[["Talep", "Kabul"], ["Onay", "Tamam"], ["Plan", "Kesin"], ["Saha", "Bitti"], ["Tahakkuk", "Onaylı"], ["Muhasebe", "Faturalandı"], ["Bildirim", "Gönderildi"]].map(([k, v]) => <div key={k} className="statusbox"><div className="k">{k}</div><div className="s">{v}</div></div>)}</div>
          <div className="toolbar" style={{ marginTop: 10 }}><button type="button" className="btn">Kaydet</button><button type="button" className="btn secondary">Taslak kaydet</button><button type="button" className="btn orange">Onaya gönder</button><button type="button" className="btn danger">İptal</button><button type="button" className="btn secondary" onClick={() => dlg.current?.showModal()}>Modal aç</button></div>
        </div>
        <div className="grid g2">
          <div className="card"><h3>Fiyat tablosu</h3>
            <div className="tablewrap"><table><thead><tr><th>Kod</th><th>Kalem</th><th className="numcell">Birim fiyat</th><th>Birim</th></tr></thead><tbody>{[["200.001", "Römorkör — temel ücret", "700,00 USD", "Manevra"], ["200.002", "Römorkör — ek GT bloğu", "30,00 USD", "1000 GT"], ["390.001", "Ayrı palamar", "100,00 USD", "Manevra"], ["500.010", "Emniyet römorkörü", "Formül", "Saat"]].map((r) => <tr key={r[0]}><td className="mono">{r[0]}</td><td>{r[1]}</td><td className="numcell">{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table></div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Faturalar TL kesilir.</div></div>
          <div className="card"><h3>Personel kartı</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div className="avatar">RK</div><div><b>Römorkör Kaptanı · Römork-1 · A</b><div className="muted" style={{ fontSize: 12 }}>Gemiadamı (STCW/MLC) · R1-A</div><div className="toolbar" style={{ marginTop: 6 }}><span className="badge ok">✓ Belgeler geçerli</span><span className="badge warn">⚠ Fazla mesai 6 sa</span><span className="badge grey">Gece 2 görev</span></div></div></div>
            <div className="tiles" style={{ marginTop: 10 }}><div className="tile"><div className="l">Gerçekleşen</div><div className="v">147,5 sa</div><div className="d up">▲ %3</div></div><div className="tile"><div className="l">En düşük dinlenme</div><div className="v">10 sa</div><div className="d">24 saatlik</div></div></div></div>
        </div>
        <div className="grid g2">
          <div className="card"><Columns title="Grafik — günlük iş adedi" series={[{ name: "Gündüz" }, { name: "Gece" }, { name: "İptal", slot: 3 }]} data={["17.10", "18.10", "19.10", "20.10", "21.10", "22.10"].map((d, i) => ({ key: d, label: d, values: [3 + (i % 3), 1 + (i % 2), i === 3 ? 1 : 0] }))} height={160} /></div>
          <div className="card"><h3>Harita</h3>
            <svg viewBox="0 0 320 170" role="img" aria-label="Altınova hizmet sahası (şematik)" style={{ width: "100%", borderRadius: 8 }}>
              <rect width="320" height="170" fill="var(--map-water)" />
              <path d="M0 110 C40 100 70 120 110 112 C150 104 170 126 210 118 C250 110 280 124 320 116 L320 170 L0 170 Z" fill="var(--map-land)" stroke="var(--map-line)" />
              <path d="M30 40 L140 70 L230 96" fill="none" stroke="var(--map-line)" strokeDasharray="5 4" strokeWidth="1.5" />
              {[[30, 40, "Demir sahası"], [140, 70, "Kılavuz biniş"], [230, 96, "Tersane rıhtımı"]].map(([x, y, l]) => <g key={String(l)}><circle cx={Number(x)} cy={Number(y)} r="5" fill="var(--orange)" stroke="var(--map-water)" strokeWidth="2" /><text x={Number(x) + 8} y={Number(y) - 6} fontSize="10" fill="var(--map-label)">{String(l)}</text></g>)}
            </svg>
            <div className="muted" style={{ fontSize: 11 }}>Şematik — koordinatlar doğrulanınca gerçek harita (AK-02/AK-11)</div></div>
        </div>
        <div className="card"><h3>Uyarılar</h3>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="alert bad"><span aria-hidden>⛔</span><div><b>Kritik — dinlenme kuralı ihlali</b>R4-B kaptanı 24 saatlik pencerede 9 sa 45 dk dinlenmiş (gerekli 10 sa).</div></div>
            <div className="alert warn"><span aria-hidden>⚠</span><div><b>Uyarı — belge süresi doluyor</b>Gemiadamı yeterlik belgesi 03.11.2026'da doluyor.</div></div>
            <div className="alert ok"><span aria-hidden>✓</span><div><b>Tamam — kayıt sunucuya kaydedildi</b>Sürüm 4 · 14:02</div></div>
            <div className="alert info"><span aria-hidden>ⓘ</span><div><b>Bilgi</b>Kur geçici: 22.10 bülteni henüz yayımlanmadı.</div></div>
          </div></div>
        <dialog ref={dlg} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--text)", padding: 18, maxWidth: 420 }}>
          <h3>Onaya gönderilsin mi?</h3>
          <p style={{ fontSize: 13 }}>Taslak, tarife sorumlusunun onayına gönderilecek. Otomatik kaydetme hiçbir zaman onay veya yayın anlamına gelmez.</p>
          <form method="dialog" className="toolbar"><button className="btn">Gönder</button><button className="btn secondary">Vazgeç</button></form>
        </dialog>
      </div>
    </div>
  );
}
