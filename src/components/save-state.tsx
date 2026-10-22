"use client";
/**
 * Kaydetme modeli — ortak durum göstergesi ve otomatik taslak.
 * Kurallar: sunucudan başarı yanıtı gelmeden "Kaydedildi" yazılmaz; otomatik taslak asla onay/yayın/fatura/sevk/bildirim değildir;
 * taslak cihazda sahibi, ilgili kayıt ve zamanıyla tutulur; hassas alanlar cihaza yazılmaz; eski taslaklar temizlenir.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState =
  | { k: "idle" } | { k: "dirty" } | { k: "saving" } | { k: "saved"; at: Date; note?: string } | { k: "local"; at: Date }
  | { k: "offline" } | { k: "failed"; msg: string } | { k: "conflict"; msg: string };

export function SaveStatus({ s }: { s: SaveState }) {
  const t = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const map: Record<SaveState["k"], [string, string, string]> = {
    idle: ["grey", "•", "Değişiklik yok"], dirty: ["warn", "●", "Kaydedilmemiş değişiklikler"], saving: ["grey", "⟳", "Kaydediliyor…"],
    saved: ["ok", "✓", ""], local: ["warn", "⇅", ""], offline: ["bad", "⚡", "Bağlantı kesildi — değişiklikler cihazda tutuluyor"],
    failed: ["bad", "⚠", ""], conflict: ["bad", "⇄", ""],
  };
  const [cls, icon, label] = map[s.k];
  const text = s.k === "saved" ? `Sunucuya kaydedildi — ${t(s.at)}${s.note ? ` · ${s.note}` : ""}` : s.k === "local" ? `Cihazda saklandı (${t(s.at)}), sunucuya kaydedilmedi` : s.k === "failed" ? `Kayıt başarısız: ${s.msg}` : s.k === "conflict" ? `Çakışma var, inceleme gerekiyor: ${s.msg}` : label;
  return <span className={`badge ${cls}`} role="status" aria-live="polite" style={{ whiteSpace: "normal" }}><span aria-hidden>{icon}</span> {text}</span>;
}

export const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

interface Draft<T> { v: T; at: string; owner: string; recordId: string | null; page: string }
const PREFIX = "pilotis.draft.";
const MAX_AGE_DAYS = 14;

/** Uzun formlar için otomatik taslak (cihaz). Sunucu kaydı ayrıdır. */
export function useAutoDraft<T>(key: string, value: T, opts: { owner: string; recordId: string | null; enabled: boolean; intervalMs?: number; strip?: (v: T) => T }) {
  const [restorable, setRestorable] = useState<Draft<T> | null>(null);
  const [lastLocal, setLastLocal] = useState<Date | null>(null);
  const latest = useRef(value); latest.current = value;
  const k = PREFIX + key;
  useEffect(() => {
    try {
      // Saklama politikası: 14 günden eski taslakları temizle
      for (let i = localStorage.length - 1; i >= 0; i--) { const kk = localStorage.key(i); if (!kk?.startsWith(PREFIX)) continue; try { const d = JSON.parse(localStorage.getItem(kk) ?? "{}") as Draft<unknown>; if (Date.now() - new Date(d.at).getTime() > MAX_AGE_DAYS * 864e5) localStorage.removeItem(kk); } catch { localStorage.removeItem(kk); } }
      const raw = localStorage.getItem(k);
      if (raw) { const d = JSON.parse(raw) as Draft<T>; if (d.owner === opts.owner) setRestorable(d); }
    } catch { /* depolama kapalı olabilir */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  useEffect(() => {
    if (!opts.enabled) return;
    const id = setInterval(() => {
      try { const d: Draft<T> = { v: opts.strip ? opts.strip(latest.current) : latest.current, at: new Date().toISOString(), owner: opts.owner, recordId: opts.recordId, page: location.pathname }; localStorage.setItem(k, JSON.stringify(d)); setLastLocal(new Date()); } catch { /* yok say */ }
    }, opts.intervalMs ?? 5000);
    return () => clearInterval(id);
  }, [k, opts.enabled, opts.owner, opts.recordId, opts.intervalMs, opts]);
  const discard = useCallback(() => { try { localStorage.removeItem(k); } catch { /* */ } setRestorable(null); setLastLocal(null); }, [k]);
  return { restorable, lastLocal, discard, dismiss: () => setRestorable(null) };
}

/** Korunmamış veri varken sayfadan ayrılırken uyar (sunucuya kaydedilmişse uyarma) */
export function useLeaveGuard(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved]);
}

/** Çevrimiçi/çevrimdışı takibi */
export function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(navigator.onLine); const a = () => setOn(true), b = () => setOn(false); window.addEventListener("online", a); window.addEventListener("offline", b); return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); }; }, []);
  return on;
}

/** Taslak kurtarma çubuğu: Devam ettir · Karşılaştır · Sil */
export function DraftBanner<T>({ draft, onResume, onDiscard, compare }: { draft: { at: string; v: T }; onResume: () => void; onDiscard: () => void; compare?: (v: T) => React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="alert info" style={{ marginBottom: 10 }}>
      <span>⇅</span>
      <div style={{ width: "100%" }}>
        <b>Kaydedilmemiş taslak bulundu</b>
        Bu cihazda {new Date(draft.at).toLocaleString("tr-TR")} tarihli, sunucuya kaydedilmemiş bir taslağınız var.
        <div className="toolbar" style={{ marginTop: 6 }}>
          <button type="button" className="btn" onClick={onResume}>Taslağı devam ettir</button>
          {compare && <button type="button" className="btn secondary" onClick={() => setShow((x) => !x)}>{show ? "Karşılaştırmayı gizle" : "Karşılaştır"}</button>}
          <button type="button" className="btn danger" onClick={onDiscard}>Taslağı sil</button>
        </div>
        {show && compare && <div style={{ marginTop: 8 }}>{compare(draft.v)}</div>}
      </div>
    </div>
  );
}
