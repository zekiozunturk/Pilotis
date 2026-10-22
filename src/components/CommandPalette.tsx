"use client";
/** Hızlı arama ve komut menüsü (Ctrl/⌘ + K) · favori sayfalar · son görüntülenen kayıtlar */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Item = { group: string; label: string; sub?: string; href: string };
const PAGES: Item[] = [
  ["/", "Kokpit"], ["/operasyonlar", "Operasyonlar"], ["/operasyonlar/yeni", "Yeni talep"], ["/portal", "Müşteri portalı"], ["/planlama", "Planlama"], ["/planlama/rotasyon", "Ekip rotasyonu"],
  ["/analiz", "Analiz — yönetici özeti"], ["/analiz/personel", "Analiz — personel"], ["/analiz/ekip", "Analiz — ekip ve vardiya"], ["/analiz/romorkor", "Analiz — römorkör"], ["/analiz/finans", "Analiz — fatura ve tahakkuk"],
  ["/analiz/plan", "Analiz — plan/gerçekleşen"], ["/analiz/is-yuku", "Analiz — iş yükü"], ["/analiz/bekleme", "Analiz — bekleme"], ["/analiz/emniyet", "Analiz — emniyet ve yorgunluk"], ["/analiz/rapor", "Rapor oluşturucu"],
  ["/gemiler", "Gemiler"], ["/taraflar", "Taraflar ve tesisler"], ["/filo", "Filo"], ["/personel", "Personel"], ["/katalog", "Hizmet kataloğu"], ["/tarife", "Tarife ve fiyat listesi"], ["/kurlar", "Döviz kurları"],
  ["/kurallar", "Mevzuat ve kurallar"], ["/acik-konular", "Açık konular"], ["/terminoloji", "Terminoloji"], ["/ayarlar", "Ayarlar"], ["/ayarlar/tema", "Tema Stüdyosu"], ["/aktarim", "Excel'den al (aktarım sihirbazı)"],
].map(([href, label]) => ({ group: "Sayfalar", label, href }));
const norm = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
const LS = { fav: (r: string) => `pilotis.fav.${r}`, recent: (r: string) => `pilotis.recent.${r}` };
export function readList(key: string): Item[] { try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; } }
function writeList(key: string, v: Item[]) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } }

export function CommandPalette({ role }: { role: string }) {
  const router = useRouter(), path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [favs, setFavs] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  // Son görüntülenen: her sayfa değişiminde kaydet
  useEffect(() => {
    const t = setTimeout(() => {
      const label = document.title.replace(/ · PILOTIS$/, "");
      const item = { group: "Son görüntülenen", label, href: path + location.search };
      const l = [item, ...readList(LS.recent(role)).filter((x) => x.href !== item.href)].slice(0, 12);
      writeList(LS.recent(role), l); setRecent(l); setFavs(readList(LS.fav(role)));
    }, 400);
    return () => clearTimeout(t);
  }, [path, role]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((x) => !x); } if (e.key === "Escape") setOpen(false); };
    const o = () => setOpen(true);
    window.addEventListener("keydown", h); window.addEventListener("pilotis:palette", o);
    return () => { window.removeEventListener("keydown", h); window.removeEventListener("pilotis:palette", o); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => input.current?.focus(), 10); setFavs(readList(LS.fav(role))); setRecent(readList(LS.recent(role))); } }, [open, role]);
  useEffect(() => {
    if (q.trim().length < 2) { setRemote([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => fetch(`/api/ara?q=${encodeURIComponent(q)}`, { signal: c.signal }).then((r) => r.json()).then((d) => setRemote(d.items ?? [])).catch(() => {}), 180);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);
  const items = useMemo(() => {
    const n = norm(q.trim());
    const pages = n ? PAGES.filter((p) => norm(p.label).includes(n)) : [];
    if (!n) return [...favs.map((f) => ({ ...f, group: "Favoriler" })), ...recent.slice(0, 8), ...PAGES.slice(0, 6)];
    return [...pages, ...remote, ...favs.filter((f) => norm(f.label).includes(n)).map((f) => ({ ...f, group: "Favoriler" }))];
  }, [q, remote, favs, recent]);
  const go = useCallback((it: Item) => { setOpen(false); router.push(it.href); }, [router]);
  if (!open) return null;
  let lastGroup = "";
  return (
    <div role="dialog" aria-modal="true" aria-label="Komut menüsü" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(5,10,20,0.45)", zIndex: 100, display: "grid", placeItems: "start center", paddingTop: "12vh" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(640px, 94vw)", padding: 0, overflow: "hidden" }}>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder="Sayfa, iş emri (OP-…), gemi, taraf, personel, terim ara…" aria-label="Ara"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } if (e.key === "Enter" && items[idx]) go(items[idx]); }}
          style={{ border: 0, borderBottom: "1px solid var(--border)", borderRadius: 0, fontSize: 16, padding: "14px 16px" }} />
        <div style={{ maxHeight: "55vh", overflowY: "auto", padding: "6px 0" }} role="listbox">
          {items.map((it, i) => { const head = it.group !== lastGroup; lastGroup = it.group; return (
            <div key={`${it.group}-${it.href}-${i}`}>
              {head && <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", padding: "8px 16px 2px" }}>{it.group}</div>}
              <button type="button" role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => go(it)} style={{ display: "flex", justifyContent: "space-between", width: "100%", border: 0, background: i === idx ? "var(--navy-100)" : "transparent", color: "var(--text)", padding: "8px 16px", cursor: "pointer", textAlign: "left", fontSize: 14 }}>
                <span>{it.label}</span><span className="muted" style={{ fontSize: 12 }}>{it.sub ?? it.href}</span>
              </button>
            </div>
          ); })}
          {!items.length && <div className="muted" style={{ padding: 16 }}>Sonuç yok</div>}
        </div>
        <div className="muted" style={{ fontSize: 11.5, padding: "8px 16px", borderTop: "1px solid var(--border)" }}>↑↓ seç · Enter aç · Esc kapat · Ctrl/⌘+K her yerden açar</div>
      </div>
    </div>
  );
}

/** Üst çubuk: arama düğmesi + bulunulan sayfayı favoriye ekle */
export function TopTools({ role }: { role: string }) {
  const path = usePathname();
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(readList(LS.fav(role)).some((f) => f.href === path)); }, [path, role]);
  const toggle = () => {
    const l = readList(LS.fav(role));
    const next = fav ? l.filter((f) => f.href !== path) : [{ group: "Favoriler", label: document.title.replace(/ · PILOTIS$/, ""), href: path }, ...l].slice(0, 20);
    writeList(LS.fav(role), next); setFav(!fav);
  };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" className="btn secondary" style={{ minHeight: 30, padding: "3px 10px" }} onClick={() => window.dispatchEvent(new Event("pilotis:palette"))} aria-label="Ara (Ctrl+K)">⌕ Ara <span className="muted" style={{ fontSize: 11 }}>Ctrl K</span></button>
      <button type="button" className="btn secondary" style={{ minHeight: 30, padding: "3px 10px" }} onClick={toggle} aria-pressed={fav} title={fav ? "Favorilerden çıkar" : "Bu sayfayı favorilere ekle"}>{fav ? "★" : "☆"}</button>
    </div>
  );
}
