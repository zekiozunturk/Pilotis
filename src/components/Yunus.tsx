"use client";
/**
 * Yunus — PILOTIS asistanı.
 * • Her ekranda ilk girişte sağ alttan çıkıp ekranı tanıtır; terim numaralarına ve data-yunus işaretli
 *   bilgilendirme noktalarına tıklanınca açıklamayı o anlatır.
 * • Soru sorulabilir (ANTHROPIC_API_KEY tanımlıysa yapay zekâ, değilse yerleşik bilgi tabanı).
 * • Yönetici ve sistem yöneticisine görev başlangıcını (bir gemi zili) ve bitişini (art arda üç zil) sesli duyurur.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FAQ, helpFor, YUNUS_INTRO } from "@/data/yunus";

type Say = { kind: "tip" | "info" | "alert-start" | "alert-end"; title: string; text: string; link?: string | null; linkLabel?: string; speech?: string; id?: string };
type Msg = { from: "me" | "yunus"; text: string; links?: { href: string; label: string }[]; source?: string };
type Prefs = { tips: boolean; sound: boolean; seen: string[] };
const KEY = "pilotis.yunus";
const loadPrefs = (): Prefs => { try { const p = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return { tips: p.tips ?? true, sound: p.sound ?? true, seen: Array.isArray(p.seen) ? p.seen : [] }; } catch { return { tips: true, sound: true, seen: [] }; } };
const savePrefs = (p: Prefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* özel pencere */ } };

// ───────── Gemi zili (Web Audio ile üretilir; dosya gerekmez) ─────────
let actx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  if (!actx) { const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return null; actx = new C(); }
  return actx;
}
function strike(ctx: AudioContext, t0: number, vol = 0.55) {
  const out = ctx.createGain(); out.gain.value = vol;
  const comp = ctx.createDynamicsCompressor(); out.connect(comp); comp.connect(ctx.destination);
  const f0 = 784; // pirinç gemi zili: uyumsuz kısmi tonlar, uzun sönüm
  for (const [r, a, d] of [[1, 1, 3.2], [2.0, 0.55, 2.4], [2.76, 0.42, 1.9], [4.07, 0.22, 1.3], [5.4, 0.18, 1.0], [8.93, 0.08, 0.6]] as const) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f0 * r; o.detune.value = (Math.random() - 0.5) * 6;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(a, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + d + 0.05);
  }
  // tokmak vuruşu
  const n = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate), ch = n.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 3;
  const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
  src.buffer = n; hp.type = "highpass"; hp.frequency.value = 2500; ng.gain.value = 0.25;
  src.connect(hp); hp.connect(ng); ng.connect(out); src.start(t0);
}
/** Açılış: bir zil · kapanış: art arda üç zil. Zillerin bitiş süresini (ms) döner. */
export function ringBells(count: 1 | 3) {
  const ctx = audio(); if (!ctx) return 0;
  void ctx.resume();
  const t = ctx.currentTime + 0.05, gap = 0.8;
  for (let i = 0; i < count; i++) strike(ctx, t + i * gap);
  return (count - 1) * gap * 1000 + 1100;
}
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const ss = window.speechSynthesis; ss.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = "tr-TR"; u.rate = 1; u.pitch = 1.05;
  const v = ss.getVoices().find((x) => x.lang?.toLowerCase().startsWith("tr")); if (v) u.voice = v;
  ss.speak(u);
}

// ───────── Yunus çizimi ─────────
export function DolphinSvg({ size = 72, talking = false }: { size?: number; talking?: boolean }) {
  return (
    <svg className={`yn-svg${talking ? " talk" : ""}`} width={size} height={size * 0.84} viewBox="0 0 120 100" aria-hidden>
      <defs>
        <linearGradient id="ynBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f7fd0" /><stop offset=".55" stopColor="#1f5fa8" /><stop offset="1" stopColor="#164a86" /></linearGradient>
        <linearGradient id="ynBelly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e8f3ff" /><stop offset="1" stopColor="#bcd9f5" /></linearGradient>
      </defs>
      <ellipse className="yn-ripple" cx="60" cy="92" rx="40" ry="4" fill="#5aa9e6" opacity=".35" />
      <g className="yn-body">
        <g className="yn-tail"><path d="M103,51 C108,46 112,40 118,35 C120,41 117,47 112,53 C117,57 121,62 122,68 C115,65 109,61 103,56 Z" fill="url(#ynBody)" /></g>
        <path d="M55,35 C62,29 69,23 78,20 C75,26 75,31 78,38 Z" fill="#1a5596" />
        <path d="M3,60 C7,57 14,56 20,56 C21,47 28,39 38,37 C54,33 76,35 92,43 C98,46 102,49 106,51 L106,55 C96,60 80,67 58,69 C40,71 26,68 16,65 C9,63.5 4,62 3,60 Z" fill="url(#ynBody)" />
        <path d="M4,61 C11,63 20,64 30,64 C48,65 70,62 93,55.5 C80,65 62,69 50,69.6 C36,70.2 24,68 16,65.6 C10,64 6,62.6 4,61 Z" fill="url(#ynBelly)" />
        <path className="yn-fin" d="M47,64 C47,71 43,77 36,81 C40,73 40,68 41,64 Z" fill="#1a5596" />
        <path d="M40,38.5 C58,35 78,37 94,45" stroke="#8cc2f0" strokeWidth="2" fill="none" opacity=".55" strokeLinecap="round" />
        <circle cx="31" cy="48" r="3.4" fill="#0b1e3a" /><circle cx="32.2" cy="46.8" r="1.15" fill="#fff" />
        <path className="yn-mouth" d="M5,60.4 C11,61.6 18,61.2 25,58.2" stroke="#0b1e3a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <ellipse cx="25" cy="54.5" rx="2.8" ry="1.8" fill="#ff9db0" opacity=".55" />
        {/* kaptan şapkası */}
        <g transform="rotate(-10 37 34)">
          <path d="M26,35 C25,25 48,23 50,33.5 Z" fill="#fff" stroke="#0b2d6b" strokeWidth="1.2" />
          <rect x="25.5" y="31.3" width="25" height="4" rx="1.5" fill="#e8501a" />
          <path d="M17,39 C21,36 31,35.2 40,36 L40,34.8 L27,34.6 C23,35 19.5,36.6 17,39 Z" fill="#0b2d6b" />
          <circle cx="38" cy="28.5" r="1.9" fill="#f4b400" />
        </g>
      </g>
    </svg>
  );
}

export function Yunus({ announce, ai, external }: { announce: boolean; ai: boolean; external: boolean }) {
  const path = usePathname();
  const [prefs, setPrefs] = useState<Prefs>({ tips: true, sound: true, seen: [] });
  const [ready, setReady] = useState(false);
  const [say, setSay] = useState<Say | null>(null);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sugs, setSugs] = useState<string[]>(FAQ.slice(0, 3).map((f) => f.q));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [talking, setTalking] = useState(false);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Say[]>([]);
  const alerting = useRef(false);
  const after = useRef<string | null>(null);
  const seenIds = useRef(new Set<string>());
  const pollNow = useRef<() => Promise<void>>(async () => {});
  const listRef = useRef<HTMLDivElement>(null);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;

  const update = (p: Partial<Prefs>) => setPrefs((o) => { const n = { ...o, ...p }; savePrefs(n); return n; });
  const show = useCallback((s: Say, ms = 12000) => {
    setSay(s);
    if (hideT.current) clearTimeout(hideT.current);
    if (ms > 0) hideT.current = setTimeout(() => setSay((c) => (c === s ? null : c)), ms);
  }, []);

  useEffect(() => { setPrefs(loadPrefs()); setReady(true); (window as unknown as { __yunus?: boolean }).__yunus = true; return () => { (window as unknown as { __yunus?: boolean }).__yunus = false; }; }, []);

  // tarayıcı sesi ancak kullanıcı etkileşiminden sonra açar
  useEffect(() => {
    const un = () => { const c = audio(); if (c) void c.resume().then(() => setUnlocked(c.state === "running")); window.speechSynthesis?.getVoices(); };
    window.addEventListener("pointerdown", un, { once: false }); window.addEventListener("keydown", un);
    return () => { window.removeEventListener("pointerdown", un); window.removeEventListener("keydown", un); };
  }, []);

  // ekran ipucu: her ekranda ilk girişte bir kez
  useEffect(() => {
    if (!ready || !prefs.tips || open) return;
    const h = helpFor(path); if (!h) return;
    const key = h.path;
    const first = prefs.seen.length === 0;
    if (prefs.seen.includes(key)) return;
    const t = setTimeout(() => {
      show({ kind: "tip", title: first ? "Merhaba, ben Yunus! 🐬" : h.title, text: first ? `${YUNUS_INTRO} Şu an “${h.title}” ekranındasınız: ${h.text}` : h.text, link: null }, first ? 16000 : 11000);
      update({ seen: [...prefsRef.current.seen, key].slice(-80) });
    }, 900);
    return () => clearTimeout(t);
  }, [path, ready, prefs.tips]); // eslint-disable-line react-hooks/exhaustive-deps

  // bilgilendirme noktaları: terim numaraları ve data-yunus işaretli öğeler
  useEffect(() => {
    const onSay = (e: Event) => { const d = (e as CustomEvent<{ title: string; text: string; link?: string; linkLabel?: string }>).detail; show({ kind: "info", ...d }, 15000); };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-yunus]") as HTMLElement | null; if (!el) return;
      e.preventDefault();
      show({ kind: "info", title: el.dataset.yunusTitle ?? "Bilgi", text: el.dataset.yunus ?? "", link: el.dataset.yunusLink ?? null }, 15000);
    };
    window.addEventListener("yunus:say", onSay); document.addEventListener("click", onClick);
    return () => { window.removeEventListener("yunus:say", onSay); document.removeEventListener("click", onClick); };
  }, [show]);

  // görev duyuruları
  const playAlert = useCallback((s: Say) => {
    const ms = ringBells(s.kind === "alert-end" ? 3 : 1);
    setTalking(true);
    setTimeout(() => { if (s.speech) speak(s.speech); }, ms);
    setTimeout(() => setTalking(false), ms + 6000);
  }, []);
  const nextAlert = useCallback(() => {
    const s = queue.current.shift();
    if (!s) { alerting.current = false; return; }
    alerting.current = true;
    show(s, 25000);
    const c = audio();
    if (prefsRef.current.sound && c && c.state === "running") playAlert(s);
    setTimeout(nextAlert, 9000);
  }, [show, playAlert]);
  useEffect(() => {
    if (!announce) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/yunus/olaylar${after.current ? `?after=${encodeURIComponent(after.current)}` : ""}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { events: { id: string; kind: string; title: string; body: string; link: string | null; speech: string }[]; now: string };
        after.current = typeof j.now === "string" ? j.now : new Date(j.now).toISOString();
        for (const e of j.events) if (!seenIds.current.has(e.id) && seenIds.current.add(e.id)) queue.current.push({ id: e.id, kind: e.kind === "OP_ENDED" ? "alert-end" : "alert-start", title: e.title, text: e.body, link: e.link, linkLabel: "İşi aç", speech: e.speech });
        if (!alerting.current && queue.current.length) nextAlert();
      } catch { /* ağ hatası: sonraki turda */ }
    };
    pollNow.current = poll;
    void poll();
    const iv = setInterval(() => { if (!stop) void poll(); }, 10_000);
    return () => { stop = true; clearInterval(iv); };
  }, [announce, nextAlert]);

  // sohbet
  useEffect(() => {
    if (open && msgs.length === 0) { const h = helpFor(path); setMsgs([{ from: "yunus", text: `${YUNUS_INTRO}${h ? `\n\nBu ekran: ${h.title}. ${h.text}` : ""}` }]); }
    if (open) setSay(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  const ask = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setMsgs((m) => [...m, { from: "me", text: t }]); setQ(""); setBusy(true);
    try {
      const r = await fetch("/api/yunus/sor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: t, path }) });
      const j = (await r.json()) as { answer?: string; links?: { href: string; label: string }[]; suggestions?: string[]; source?: string; error?: string };
      setMsgs((m) => [...m, { from: "yunus", text: j.answer ?? j.error ?? "Bir sorun oldu.", links: j.links, source: j.source }]);
      if (j.suggestions?.length) setSugs(j.suggestions);
    } catch { setMsgs((m) => [...m, { from: "yunus", text: "Bağlantı kurulamadı, birazdan tekrar deneyin." }]); }
    finally { setBusy(false); }
  };
  const test = async (kind: "start" | "end") => { const c = audio(); if (c) await c.resume(); setUnlocked(c?.state === "running"); setOpen(false); const r = await fetch("/api/yunus/deneme", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) }); const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string }; if (!j.ok) { show({ kind: "info", title: "Deneme bildirimi", text: j.message ?? "Gönderilemedi" }); return; } await pollNow.current(); };

  const isAlert = say?.kind === "alert-start" || say?.kind === "alert-end";
  return (
    <div className={`yunus${open ? " open" : ""}${say ? " saying" : ""}${isAlert ? " alerting" : ""}`}>
      {say && !open && (
        <div className={`yn-bubble ${say.kind}`} role={isAlert ? "alert" : "status"} aria-live={isAlert ? "assertive" : "polite"}>
          <button className="yn-x" onClick={() => setSay(null)} aria-label="Kapat">×</button>
          {isAlert && <div className="yn-kicker">{say.kind === "alert-start" ? "🔔 Görev başladı" : "🔔🔔🔔 Görev bitti"}</div>}
          <b>{say.title}</b>
          <div className="yn-text">{say.text}</div>
          <div className="yn-acts">
            {say.link && <Link href={say.link} className="btn sm orange" onClick={() => setSay(null)}>{say.linkLabel ?? "Aç"}</Link>}
            {isAlert && (!unlocked || !prefs.sound) && <button className="btn sm secondary" onClick={async () => { const c = audio(); if (c) await c.resume(); setUnlocked(true); if (!prefs.sound) update({ sound: true }); playAlert(say); }}>🔊 Sesli dinle</button>}
            {say.kind === "tip" && <button className="btn sm secondary" onClick={() => setOpen(true)}>Yunus'a sor</button>}
            {say.kind === "tip" && <button className="btn sm ghost" onClick={() => { update({ tips: false }); setSay(null); }}>İpuçlarını kapat</button>}
          </div>
        </div>
      )}

      {open && (
        <section className="yn-panel" aria-label="Yunus asistan">
          <header>
            <DolphinSvg size={42} talking={busy} />
            <div><b>Yunus</b><span>PILOTIS asistanı · {ai ? "yapay zekâ destekli" : "yerleşik bilgi tabanı"}</span></div>
            <button className="yn-x" onClick={() => setOpen(false)} aria-label="Kapat">×</button>
          </header>
          <div className="yn-list" ref={listRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`yn-msg ${m.from === "yunus" ? "bot" : "me"}`}>
                <div className="yn-text">{m.text}</div>
                {m.links?.map((l) => <Link key={l.href} href={l.href} className="yn-link" onClick={() => setOpen(false)}>{l.label} ›</Link>)}
              </div>
            ))}
            {busy && <div className="yn-msg bot"><span className="yn-dots"><i /><i /><i /></span></div>}
          </div>
          <div className="yn-sugs">{sugs.map((s) => <button key={s} onClick={() => void ask(s)} disabled={busy}>{s}</button>)}</div>
          <form className="yn-ask" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yunus'a sorun… (ör. palamar nedir?)" aria-label="Soru" maxLength={1000} />
            <button className="btn orange" disabled={busy || !q.trim()}>Sor</button>
          </form>
          <footer>
            <label className="check"><input type="checkbox" checked={prefs.tips} onChange={(e) => update({ tips: e.target.checked, ...(e.target.checked ? { seen: [] } : {}) })} /> Ekran ipuçları</label>
            {announce && <label className="check"><input type="checkbox" checked={prefs.sound} onChange={(e) => update({ sound: e.target.checked })} /> Sesli görev bildirimi</label>}
            {announce && <span className="yn-test">Deneme: <button onClick={() => void test("start")}>başlangıç 🔔</button><button onClick={() => void test("end")}>bitiş 🔔🔔🔔</button></span>}
            {!external && !ai && <span className="muted small">Yapay zekâ yanıtları için sunucuda ANTHROPIC_API_KEY tanımlanmalı.</span>}
          </footer>
        </section>
      )}

      <button className={`yn-fab${talking ? " talk" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Yunus'u kapat" : "Yunus asistanı aç"} title="Yunus — PILOTIS asistanı">
        <DolphinSvg size={78} talking={talking || !!say} />
        {!open && !say && <span className="yn-hint">Sor</span>}
      </button>
    </div>
  );
}
