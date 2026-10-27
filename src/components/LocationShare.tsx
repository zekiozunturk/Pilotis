"use client";
/**
 * Kaptanın konum paylaşımı: tarayıcı konum izni ile görevdeki aracın konumunu iletir.
 * Paylaşım yalnız bu sayfa açıkken ve kaptan açtığında çalışır; sayfa kapanınca durur.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Opt = { id: string; label: string };
type Last = { at: string; lat: number; lon: number; accuracyM: number | null } | null;
const KEY = "pilotis.konum.otomatik";
const dist = (a: GeolocationCoordinates, b: { lat: number; lon: number }) => { const R = 6371000, toR = Math.PI / 180, dLa = (b.lat - a.latitude) * toR, dLo = (b.lon - a.longitude) * toR; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.latitude * toR) * Math.cos(b.lat * toR) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

export function LocationShare({ assets, defaultAssetId, last }: { assets: Opt[]; defaultAssetId: string | null; last: Last }) {
  const [assetId, setAssetId] = useState(defaultAssetId ?? assets[0]?.id ?? "");
  const [perm, setPerm] = useState<"granted" | "denied" | "prompt" | "unsupported" | "insecure" | "unknown">("unknown");
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastSent, setLastSent] = useState<Last>(last);
  const watch = useRef<number | null>(null);
  const sentAt = useRef(0), sentPos = useRef<{ lat: number; lon: number } | null>(last ? { lat: last.lat, lon: last.lon } : null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) { setPerm("insecure"); return; }
    if (!("geolocation" in navigator)) { setPerm("unsupported"); return; }
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => { setPerm(p.state); p.onchange = () => setPerm(p.state); }).catch(() => setPerm("prompt"));
    try { if (localStorage.getItem(KEY) === "1") setAuto(true); } catch { /* özel pencere */ }
  }, []);

  const send = useCallback(async (c: GeolocationCoordinates) => {
    const r = await fetch("/api/konum", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId, lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, speed: c.speed, heading: c.heading }) });
    const j = (await r.json()) as { ok: boolean; message: string; at?: string; skipped?: boolean };
    if (j.ok && !j.skipped) { sentAt.current = Date.now(); sentPos.current = { lat: c.latitude, lon: c.longitude }; setLastSent({ at: j.at ?? new Date().toISOString(), lat: c.latitude, lon: c.longitude, accuracyM: Math.round(c.accuracy) }); }
    if (!j.skipped) setMsg({ ok: j.ok, text: j.message });
    return j.ok;
  }, [assetId]);

  const geoErr = (e: GeolocationPositionError) => setMsg({ ok: false, text: e.code === 1 ? "Konum izni verilmedi. Tarayıcının adres çubuğundaki konum simgesinden izin verin." : e.code === 3 ? "Konum alınamadı (zaman aşımı) — açık alanda tekrar deneyin." : "Konum alınamadı." });

  const once = () => {
    if (!assetId) { setMsg({ ok: false, text: "Önce aracı seçin" }); return; }
    setBusy(true); setMsg(null);
    navigator.geolocation.getCurrentPosition(async (p) => { setPerm("granted"); try { await send(p.coords); } finally { setBusy(false); } }, (e) => { setBusy(false); geoErr(e); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  };

  // Otomatik paylaşım: 25 m'den fazla hareket veya 60 sn'de bir
  useEffect(() => {
    if (!auto || !assetId || perm === "insecure" || perm === "unsupported") return;
    watch.current = navigator.geolocation.watchPosition((p) => {
      setPerm("granted");
      const moved = sentPos.current ? dist(p.coords, sentPos.current) : Infinity;
      if (moved > 25 || Date.now() - sentAt.current > 60_000) void send(p.coords);
    }, (e) => { geoErr(e); setAuto(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    return () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); };
  }, [auto, assetId, perm, send]);

  const toggle = (v: boolean) => { setAuto(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* yok say */ } if (v) setMsg({ ok: true, text: "Otomatik paylaşım açık — bu sayfa açık kaldıkça konum iletilir" }); };
  const PERM: Record<typeof perm, [string, string]> = { granted: ["Konum izni verildi", "ok"], denied: ["Konum izni reddedildi", "bad"], prompt: ["İzin istenecek", "warn"], unsupported: ["Cihaz konum desteklemiyor", "bad"], insecure: ["Güvenli bağlantı (HTTPS) gerekli", "bad"], unknown: ["Kontrol ediliyor…", "grey"] };

  return (
    <div className="card locshare" id="konum">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>📍 Konumumu paylaş</h2>
        <span className={`badge ${PERM[perm][1]}`}>{PERM[perm][0]}</span>
      </div>
      <p className="muted small">Aracınızın konumu operasyon haritasında adınızla görünür. Konum yalnız siz paylaştığınızda ve bu sayfa açıkken alınır; görev dışında paylaşım yapmayın.</p>
      <div className="locshare-row">
        <label>Araç
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} aria-label="Konumu paylaşılacak araç">
            {assets.length === 0 && <option value="">Vardiyanızda araç yok</option>}
            {assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <button className="btn orange" onClick={once} disabled={busy || !assetId || perm === "insecure" || perm === "unsupported"}>{busy ? "Konum alınıyor…" : "Konumu güncelle ve ilet"}</button>
      </div>
      <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={auto} onChange={(e) => toggle(e.target.checked)} disabled={!assetId || perm === "insecure" || perm === "unsupported" || perm === "denied"} /> Görev boyunca otomatik paylaş (hareket ettikçe, en geç dakikada bir)</label>
      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`} role="status" style={{ marginTop: 8 }}><span>{msg.ok ? "✓" : "✕"}</span><div>{msg.text}</div></div>}
      <div className="muted small" style={{ marginTop: 6 }}>{lastSent ? <>Son iletim: {new Date(lastSent.at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })} · {lastSent.lat.toFixed(5)}, {lastSent.lon.toFixed(5)}{lastSent.accuracyM ? ` · ±${lastSent.accuracyM} m` : ""}</> : "Henüz konum iletilmedi."}</div>
      {perm === "denied" && <p className="small" style={{ color: "var(--bad)" }}>İzni yeniden vermek için tarayıcı ayarlarında bu siteye konum izni verin ve sayfayı yenileyin.</p>}
    </div>
  );
}
