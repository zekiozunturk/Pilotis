"use client";
/**
 * Harita kokpiti: solda bölgedeki gemi trafiği (ücretsiz AIS), sağda filomuzun canlı konumu.
 * Sağ harita: Leaflet + OpenStreetMap + OpenSeaMap deniz işaretleri. Araç işaretinde bayrak: beyaz = boşta, kırmızı = görevde.
 */
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LMap, Marker, LayerGroup } from "leaflet";

type Task = { ref: string; vessel: string; gt: number | null; type: string; from: string | null; to: string | null; start: string | null; status: string; statusLabel: string; role: string | null };
type Asset = {
  id: string; code: string | null; name: string; type: string; typeLabel: string; photoUrl: string | null; illustrative: boolean; available: boolean;
  lat: number; lon: number; at: string; source: "DEVICE" | "AIS" | "DEMO"; accuracyM: number | null; speedKn: number | null; heading: number | null; sharedBy: string | null;
  busy: boolean; captain: string | null; crew: { name: string; role: string }[]; shiftEnd: string | null; onDuty: boolean; task: Task | null; next: Task | null;
};
type Live = { assets: Asset[]; base: { lat: number; lon: number }; generatedAt: string; demo: boolean };
type Ship = { mmsi: number; name: string; lat: number; lon: number; sog: number | null; cog: number | null; dest: string | null };

const t = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "az önce" : m < 60 ? `${m} dk önce` : `${Math.round(m / 60)} sa önce`; };
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const short = (a: Asset) => a.code ?? a.name.replace(/^(Pilot|Palamar) Bot (\d)$/, (_, k, n) => (k === "Pilot" ? `K${n}` : `P${n}`)).replace("Deniz Yüzeyi Temizleme Teknesi", "DT");

function flagHtml(a: Asset, labels: boolean) {
  const cls = `fm ${a.busy ? "busy" : "idle"} ${a.available ? "" : "off"} t-${a.type.toLowerCase()}`;
  const flag = `<svg class="flag" viewBox="0 0 28 30" aria-hidden="true"><line x1="3" y1="2" x2="3" y2="29" class="pole"/><path class="cloth" d="M3 3 C 9 0, 14 6, 20 3 S 26 3, 26 3 L 26 15 C 20 18, 15 12, 9 15 S 3 15, 3 15 Z"/></svg>`;
  const label = labels ? `<span class="lbl"><b>${esc(short(a))} · ${esc(a.name)}</b>${a.captain ? `<i>Kpt. ${esc(a.captain)}</i>` : ""}${a.task ? `<i class="v">⚓ ${esc(a.task.vessel.replace("ÖRNEK ", ""))}</i>` : ""}</span>` : "";
  return `<div class="${cls}" title="${esc(a.name)}">${flag}<span class="hull">${esc(short(a))}</span>${label}</div>`;
}
function popupHtml(a: Asset) {
  const task = a.task ? `<div class="pp-sec busy"><div class="pp-k">🚩 Görevde — ${esc(a.task.statusLabel)}</div><a class="pp-ref" href="/operasyonlar/${esc(a.task.ref)}">${esc(a.task.ref)}</a> · <b>${esc(a.task.vessel)}</b>${a.task.gt ? ` <span class="pp-m">${a.task.gt.toLocaleString("tr-TR")} GT</span>` : ""}<div>${esc(a.task.type)}${a.task.role ? ` · ${esc(a.task.role)}` : ""}</div><div class="pp-m">${esc(a.task.from ?? "—")} → ${esc(a.task.to ?? "—")} · plan ${t(a.task.start)}</div></div>`
    : `<div class="pp-sec idle"><div class="pp-k">🏳️ Boşta — görev yok</div>${a.onDuty ? "Vardiyada, çağrıya hazır" : "Vardiya dışında"}</div>`;
  const next = a.next ? `<div class="pp-m">Sonraki: <a href="/operasyonlar/${esc(a.next.ref)}">${esc(a.next.ref)}</a> ${esc(a.next.vessel)} · ${t(a.next.start)}</div>` : "";
  const src = a.source === "DEVICE" ? `📍 Kaptan cihazı${a.sharedBy ? ` (${esc(a.sharedBy)})` : ""} · ${ago(a.at)}${a.accuracyM ? ` · ±${a.accuracyM} m` : ""}${a.speedKn != null ? ` · ${a.speedKn} kn` : ""}` : a.source === "AIS" ? `📡 AIS · ${ago(a.at)}` : "⚠ ÖRNEK konum (sunum) — kaptan konum paylaşınca gerçek konum görünür";
  return `<div class="pp">
    ${a.photoUrl ? `<img src="${esc(a.photoUrl)}" alt="" class="pp-img">${a.illustrative ? `<span class="pp-tag">Temsili fotoğraf</span>` : ""}` : ""}
    <div class="pp-h"><b>${esc(a.code ? `${a.code} · ${a.name}` : a.name)}</b><span>${esc(a.typeLabel)}${a.available ? "" : " · kullanım dışı"}</span></div>
    <div class="pp-row"><span>Kaptan</span><b>${esc(a.captain ?? "—")}</b></div>
    ${a.crew.length ? `<div class="pp-row"><span>Ekip</span><span>${a.crew.map((c) => `${esc(c.name)} <i>(${esc(c.role)})</i>`).join(", ")}</span></div>` : ""}
    ${a.shiftEnd ? `<div class="pp-row"><span>Vardiya bitişi</span><span>${t(a.shiftEnd)}</span></div>` : ""}
    ${task}${next}
    <div class="pp-src">${src}</div>
  </div>`;
}

export function LiveMaps({ initial, aisConfigured }: { initial: Live; aisConfigured: boolean }) {
  const [data, setData] = useState<Live>(initial);
  const [filter, setFilter] = useState<"ALL" | "BUSY" | "IDLE" | "TUG" | "BOAT">("ALL");
  const [labels, setLabels] = useState(true);
  const [left, setLeft] = useState<"VF" | "PILOTIS">("VF");
  const [full, setFull] = useState<"" | "L" | "R">("");
  const [updated, setUpdated] = useState<string>(initial.generatedAt);
  const [err, setErr] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement>(null), aisEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null), aisRef = useRef<LMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const shipLayer = useRef<LayerGroup | null>(null);
  const Lref = useRef<typeof import("leaflet") | null>(null);

  const visible = useMemo(() => data.assets.filter((a) => filter === "ALL" || (filter === "BUSY" ? a.busy : filter === "IDLE" ? !a.busy : filter === "TUG" ? a.type === "TUG" : a.type !== "TUG")), [data, filter]);

  // Sağ harita kurulumu
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || mapRef.current) return;
      Lref.current = L;
      const m = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([40.714, 29.472], 14);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap katkıcıları" }).addTo(m);
      L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "Deniz işaretleri © OpenSeaMap" }).addTo(m);
      L.marker([initial.base.lat, initial.base.lon], { icon: L.divIcon({ className: "", html: `<div class="base-pin" title="Yalova Pilotaj üssü">⚓<span>Yalova Pilotaj üssü</span></div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: false }).addTo(m);
      mapRef.current = m;
      // Yakın yakınlaştırmada tüm etiketler, uzakta yalnız görevdekilerin etiketi (üst üste binmesin)
      const zc = () => m.getContainer().classList.toggle("z-low", m.getZoom() < 16);
      m.on("zoomend", zc); zc();
      setTimeout(() => m.invalidateSize(), 50);
    })();
    return () => { cancelled = true; };
  }, [initial.base.lat, initial.base.lon]);

  // İşaretleri güncelle
  const draw = useCallback(() => {
    const L = Lref.current, m = mapRef.current;
    if (!L || !m) return;
    const keep = new Set(visible.map((a) => a.id));
    for (const [id, mk] of markers.current) if (!keep.has(id)) { mk.remove(); markers.current.delete(id); }
    for (const a of visible) {
      const icon = L.divIcon({ className: "", html: flagHtml(a, labels), iconSize: [30, 34], iconAnchor: [4, 32], popupAnchor: [10, -30] });
      const mk = markers.current.get(a.id);
      if (mk) { mk.setLatLng([a.lat, a.lon]); mk.setIcon(icon); mk.setPopupContent(popupHtml(a)); }
      else { const n = L.marker([a.lat, a.lon], { icon, title: a.name, riseOnHover: true, keyboard: true }).bindPopup(popupHtml(a), { maxWidth: 300, minWidth: 240 }).addTo(m); markers.current.set(a.id, n); }
    }
  }, [visible, labels]);
  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const id = setInterval(() => { if (mapRef.current) { draw(); clearInterval(id); } }, 100); return () => clearInterval(id); }, [draw]);

  // 15 sn'de bir canlı veri
  useEffect(() => {
    const tick = async () => {
      try { const r = await fetch("/api/filo/canli", { cache: "no-store" }); if (!r.ok) throw new Error(String(r.status)); const j = (await r.json()) as Live; setData(j); setUpdated(j.generatedAt); setErr(null); }
      catch { setErr("Canlı veri alınamadı — yeniden deneniyor"); }
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // Sol harita: kendi AIS haritamız (aisstream anahtarı varsa)
  useEffect(() => {
    if (left !== "PILOTIS" || !aisConfigured) return;
    let stop = false;
    let iv: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!aisEl.current || stop) return;
      if (!aisRef.current) {
        aisRef.current = L.map(aisEl.current).setView([40.715, 29.48], 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap katkıcıları · AIS: aisstream.io" }).addTo(aisRef.current);
        shipLayer.current = L.layerGroup().addTo(aisRef.current);
      }
      const load = async () => {
        const b = aisRef.current!.getBounds();
        const r = await fetch(`/api/ais?s=${b.getSouth()}&w=${b.getWest()}&n=${b.getNorth()}&e=${b.getEast()}`, { cache: "no-store" });
        const j = (await r.json()) as { ships: Ship[] };
        if (stop || !shipLayer.current) return;
        shipLayer.current.clearLayers();
        for (const sh of j.ships) L.marker([sh.lat, sh.lon], { icon: L.divIcon({ className: "", html: `<div class="ship" style="transform:rotate(${sh.cog ?? 0}deg)"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
          .bindPopup(`<b>${esc(sh.name || String(sh.mmsi))}</b><br>MMSI ${sh.mmsi}${sh.sog != null ? `<br>${sh.sog} kn` : ""}${sh.dest ? `<br>Hedef: ${esc(sh.dest)}` : ""}`).addTo(shipLayer.current);
      };
      await load();
      if (!stop) iv = setInterval(load, 60_000);
    })();
    return () => { stop = true; if (iv) clearInterval(iv); };
  }, [left, aisConfigured]);

  useEffect(() => { setTimeout(() => { mapRef.current?.invalidateSize(); aisRef.current?.invalidateSize(); }, 80); }, [full]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(""); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const focus = (a: Asset) => { const m = mapRef.current, mk = markers.current.get(a.id); if (!m || !mk) return; m.flyTo([a.lat, a.lon], Math.max(m.getZoom(), 15), { duration: 0.6 }); setTimeout(() => mk.openPopup(), 650); };
  const fitAll = () => { const L = Lref.current, m = mapRef.current; if (!L || !m || !visible.length) return; m.fitBounds(L.latLngBounds(visible.map((a) => [a.lat, a.lon] as [number, number])).pad(0.3)); };
  const busyN = data.assets.filter((a) => a.busy).length;
  const vfSrc = `/harita/ais.html?lat=40.7150&lon=29.4800&z=12&names=1&h=${full === "L" ? 900 : 460}`;

  return (
    <section className={`livemaps ${full ? `full-${full}` : ""}`} aria-label="Canlı haritalar">
      <div className="lm-panel lm-left">
        <div className="lm-head">
          <div><h2>Bölgedeki gemi trafiği</h2><div className="muted small">Canlı AIS · İzmit Körfezi girişi / Yalova</div></div>
          <div className="toolbar">
            <div className="seg" role="tablist" aria-label="AIS kaynağı">
              <button role="tab" aria-selected={left === "VF"} className={left === "VF" ? "on" : ""} onClick={() => setLeft("VF")}>VesselFinder</button>
              <button role="tab" aria-selected={left === "PILOTIS"} className={left === "PILOTIS" ? "on" : ""} onClick={() => setLeft("PILOTIS")} title={aisConfigured ? "aisstream.io verisiyle kendi haritamız" : "aisstream.io ücretsiz anahtarı tanımlanınca açılır"}>PILOTIS AIS</button>
            </div>
            <button className="btn secondary sm" onClick={() => setFull(full === "L" ? "" : "L")} aria-pressed={full === "L"}>{full === "L" ? "Küçült" : "Büyüt"}</button>
          </div>
        </div>
        <div className="lm-map">
          {left === "VF" ? <iframe key={vfSrc} src={vfSrc} title="Canlı AIS gemi haritası (VesselFinder)" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            : aisConfigured ? <div ref={aisEl} className="leaf" />
            : <div className="lm-empty"><b>Kendi AIS haritamız için ücretsiz anahtar gerekiyor</b><p>aisstream.io üzerinden ücretsiz hesap açıp anahtarı sunucuya <code>AISSTREAM_API_KEY</code> olarak tanımlayın; gemiler bu haritada PILOTIS verisi olarak görünür ve işlerle eşleştirilebilir. O zamana kadar VesselFinder haritası kullanılır.</p><button className="btn secondary" onClick={() => setLeft("VF")}>VesselFinder haritasına dön</button></div>}
        </div>
        <div className="lm-foot muted small">Veri: {left === "VF" ? <a href="https://www.vesselfinder.com" target="_blank" rel="noreferrer">VesselFinder</a> : <a href="https://aisstream.io" target="_blank" rel="noreferrer">aisstream.io</a>} ücretsiz AIS · gemi üzerine tıklayarak ayrıntı görün</div>
      </div>

      <div className="lm-panel lm-right">
        <div className="lm-head">
          <div><h2>Filomuz — canlı konum</h2><div className="muted small">{busyN} görevde · {data.assets.length - busyN} boşta · güncellendi {t(updated)}{err ? ` · ${err}` : ""}</div></div>
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Filtre">
              {([["ALL", "Tümü"], ["BUSY", "Görevde"], ["IDLE", "Boşta"], ["TUG", "Römorkör"], ["BOAT", "Botlar"]] as const).map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
            <label className="check sm"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Etiketler</label>
            <button className="btn secondary sm" onClick={fitAll}>Tümünü göster</button>
            <button className="btn secondary sm" onClick={() => setFull(full === "R" ? "" : "R")} aria-pressed={full === "R"}>{full === "R" ? "Küçült" : "Büyüt"}</button>
          </div>
        </div>
        {data.demo && <div className="lm-demo small">⚠ Konumu paylaşılmayan araçlar için <b>ÖRNEK</b> konum gösteriliyor. Kaptan “Görevlerim” ekranından konum paylaşınca gerçek konum görünür.</div>}
        <div className="lm-map"><div ref={mapEl} className="leaf" role="application" aria-label="Filo haritası" /></div>
        <div className="lm-legend small"><span><i className="lg idle" /> Boşta (beyaz bayrak)</span><span><i className="lg busy" /> Görevde (kırmızı bayrak)</span><span>⚓ Üs</span></div>
        <ul className="lm-list" aria-label="Araç listesi">
          {visible.map((a) => (
            <li key={a.id}>
              <button onClick={() => focus(a)} className={a.busy ? "busy" : "idle"}>
                <span className="dot" aria-hidden /> <b>{short(a)}</b> <span className="n">{a.name}</span>
                <span className="c">{a.captain ? `Kpt. ${a.captain}` : "—"}</span>
                <span className="s">{a.task ? `${a.task.statusLabel}: ${a.task.vessel.replace("ÖRNEK ", "")}` : a.next ? `Boşta · sonraki ${t(a.next.start)}` : "Boşta"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
