/**
 * Görünüm tercihleri — dört seviye: kurumsal varsayılan → rol başlangıcı → kişisel → cihaz.
 * Kurumsal yönetici hangi alanların kişiselleştirilebileceğini kilitler (locked).
 */
export const THEMES = [
  { id: "maritime", name: "Maritime Command", desc: "Lacivert, turkuaz ve beyaz; güçlü denizcilik komuta merkezi", modes: ["light", "dark"] },
  { id: "arctic", name: "Arctic Light", desc: "Açık gri, buz mavisi ve beyaz; ferah, sade, yüksek okunabilirlik", modes: ["light"] },
  { id: "midnight", name: "Midnight Operations", desc: "Koyu lacivert, düşük parlaklık ve kontrollü vurgular; gece operasyonu", modes: ["dark"] },
  { id: "copper", name: "Black & Copper", desc: "Siyah, antrasit ve bakır; premium yönetici kokpiti", modes: ["dark"] },
  { id: "nordic", name: "Nordic Minimal", desc: "Sıcak beyaz, taş grisi ve koyu yeşil; dengeli ve sakin", modes: ["light", "dark"] },
  { id: "steel", name: "Industrial Steel", desc: "Çelik grisi, koyu mavi ve amber; teknik operasyon görünümü", modes: ["light", "dark"] },
  { id: "ocean", name: "Ocean Glass", desc: "Deniz mavisi, katmanlı yüzeyler ve ölçülü cam etkisi", modes: ["light", "dark"] },
  { id: "radar", name: "Radar Control", desc: "Koyu zemin, yeşil ve camgöbeği; radar esintili canlı takip", modes: ["dark"] },
  { id: "ivory", name: "Executive Ivory", desc: "Fildişi, koyu kahve ve bronz; finans ve raporlama odaklı", modes: ["light"] },
  { id: "contrast", name: "High Contrast", desc: "Güçlü kontrast, belirgin sınırlar ve büyük kontroller; saha erişilebilirliği", modes: ["light", "dark"] },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

export interface UiPrefs {
  theme: ThemeId;
  appearance: "light" | "dark" | "system";
  accent: string;            // "" = tema varsayılanı
  font: "s" | "m" | "l" | "xl";
  density: "comfortable" | "standard" | "compact";
  radius: "theme" | "sharp" | "soft" | "round";
  side: "narrow" | "standard" | "wide";
  motion: "full" | "reduced" | "none";
  chart: "theme" | "contrast";
  map: "theme" | "light" | "dark";
  touch: boolean;
  reducedMotion: boolean;
  perf: boolean;
}
export type PrefKey = keyof UiPrefs;
export const PREF_LABEL: Record<PrefKey, string> = {
  theme: "Tema", appearance: "Açık/koyu/sistem", accent: "Vurgu rengi", font: "Yazı boyutu", density: "Tablo yoğunluğu", radius: "Kart ve panel köşesi",
  side: "Sol menü genişliği", motion: "Animasyon seviyesi", chart: "Grafik renk paleti", map: "Harita görünümü", touch: "Büyük dokunma alanları", reducedMotion: "Azaltılmış hareket", perf: "Performans modu",
};
export const DEFAULT_PREFS: UiPrefs = { theme: "maritime", appearance: "light", accent: "", font: "m", density: "standard", radius: "theme", side: "standard", motion: "reduced", chart: "theme", map: "theme", touch: false, reducedMotion: false, perf: false };
export const ACCENTS = [{ v: "", l: "Tema varsayılanı" }, { v: "#e8501a", l: "PILOTIS turuncu" }, { v: "#14b8c8", l: "Turkuaz" }, { v: "#c27a4a", l: "Bakır" }, { v: "#f2a900", l: "Amber" }, { v: "#2bd67b", l: "Radar yeşili" }, { v: "#7c5cff", l: "Mor" }, { v: "#d6336c", l: "Mercan" }];

export interface UiPolicy { corporate: Partial<UiPrefs>; roles: Record<string, Partial<UiPrefs>>; locked: PrefKey[] }
export const EMPTY_POLICY: UiPolicy = { corporate: {}, roles: {}, locked: [] };

const VALID: { [K in PrefKey]: (v: unknown) => boolean } = {
  theme: (v) => THEMES.some((t) => t.id === v), appearance: (v) => ["light", "dark", "system"].includes(v as string), accent: (v) => v === "" || /^#[0-9a-f]{6}$/i.test(String(v)),
  font: (v) => ["s", "m", "l", "xl"].includes(v as string), density: (v) => ["comfortable", "standard", "compact"].includes(v as string), radius: (v) => ["theme", "sharp", "soft", "round"].includes(v as string),
  side: (v) => ["narrow", "standard", "wide"].includes(v as string), motion: (v) => ["full", "reduced", "none"].includes(v as string), chart: (v) => ["theme", "contrast"].includes(v as string),
  map: (v) => ["theme", "light", "dark"].includes(v as string), touch: (v) => typeof v === "boolean", reducedMotion: (v) => typeof v === "boolean", perf: (v) => typeof v === "boolean",
};
export function sanitize(p: unknown): Partial<UiPrefs> {
  const out: Partial<UiPrefs> = {};
  if (!p || typeof p !== "object") return out;
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) if (k in VALID && VALID[k as PrefKey](v)) (out as Record<string, unknown>)[k] = v;
  return out;
}
/** Seviye birleştirme — kilitli alanlarda kişisel ve cihaz tercihi yok sayılır */
export function resolvePrefs(policy: UiPolicy, role: string, personal: Partial<UiPrefs>, device: Partial<UiPrefs> = {}): UiPrefs {
  const unlocked = (x: Partial<UiPrefs>) => Object.fromEntries(Object.entries(x).filter(([k]) => !policy.locked.includes(k as PrefKey)));
  return { ...DEFAULT_PREFS, ...sanitize(policy.corporate), ...sanitize(policy.roles[role] ?? {}), ...unlocked(sanitize(personal)), ...unlocked(sanitize(device)) };
}
/** Temanın desteklemediği görünüm istenirse temanın kendi görünümüne düşer */
export function effectiveMode(p: UiPrefs, systemDark = false): "light" | "dark" {
  const t = THEMES.find((x) => x.id === p.theme)!;
  const want = p.appearance === "system" ? (systemDark ? "dark" : "light") : p.appearance;
  return (t.modes as readonly string[]).includes(want) ? want : (t.modes[0] as "light" | "dark");
}
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** <html> öznitelikleri ve stil değişkenleri */
export function htmlAttrs(p: UiPrefs, systemDark = false): { attrs: Record<string, string>; style: Record<string, string> } {
  const attrs: Record<string, string> = {
    "data-theme": p.theme, "data-mode": effectiveMode(p, systemDark), "data-density": p.density, "data-font": p.font, "data-side": p.side,
    "data-motion": p.reducedMotion ? "none" : p.motion, "data-chart": p.chart, "data-touch": p.touch ? "1" : "0", "data-perf": p.perf ? "1" : "0",
    "data-appearance": p.appearance,
  };
  if (p.radius !== "theme") attrs["data-radius"] = p.radius;
  if (p.map !== "theme") attrs["data-map"] = p.map;
  const style: Record<string, string> = {};
  if (p.accent) { style["--orange"] = p.accent; style["--accent-fg"] = lum(p.accent) > 0.4 ? "#111" : "#fff"; }
  return { attrs, style };
}
/** Sayfa boyanmadan önce cihaz tercihlerini ve "sistem" görünümünü uygulayan satır içi betik */
export const DEVICE_SCRIPT = `(function(){try{var r=document.documentElement;var pol=JSON.parse(r.getAttribute('data-locked')||'[]');var d=JSON.parse(localStorage.getItem('pilotis.ui.device')||'{}');var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var modes=JSON.parse(r.getAttribute('data-modes')||'["light"]');var map={theme:'data-theme',density:'data-density',font:'data-font',side:'data-side',chart:'data-chart',map:'data-map',radius:'data-radius'};for(var k in d){if(pol.indexOf(k)>=0)continue;if(map[k]){if(k==='radius'&&d[k]==='theme'){r.removeAttribute('data-radius');continue}if(k==='map'&&d[k]==='theme'){r.removeAttribute('data-map');continue}r.setAttribute(map[k],d[k]);}if(k==='touch')r.setAttribute('data-touch',d[k]?'1':'0');if(k==='perf')r.setAttribute('data-perf',d[k]?'1':'0');if(k==='accent'&&d[k]){r.style.setProperty('--orange',d[k]);}if(k==='appearance')r.setAttribute('data-appearance',d[k]);if(k==='motion')r.setAttribute('data-motion',d[k]);if(k==='reducedMotion'&&d[k])r.setAttribute('data-motion','none');}var ap=r.getAttribute('data-appearance');if(ap==='system'){var want=m?'dark':'light';var t=r.getAttribute('data-theme');var tm={maritime:['light','dark'],arctic:['light'],midnight:['dark'],copper:['dark'],nordic:['light','dark'],steel:['light','dark'],ocean:['light','dark'],radar:['dark'],ivory:['light'],contrast:['light','dark']}[t]||['light'];r.setAttribute('data-mode',tm.indexOf(want)>=0?want:tm[0]);}else if(d.theme||d.appearance){var t2=r.getAttribute('data-theme');var tm2={maritime:['light','dark'],arctic:['light'],midnight:['dark'],copper:['dark'],nordic:['light','dark'],steel:['light','dark'],ocean:['light','dark'],radar:['dark'],ivory:['light'],contrast:['light','dark']}[t2]||['light'];r.setAttribute('data-mode',tm2.indexOf(ap)>=0?ap:tm2[0]);}}catch(e){}})();`;
