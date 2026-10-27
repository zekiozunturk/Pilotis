"use client";
import { useEffect, useRef, useState } from "react";

/** Terim üst simgesi: Palamar⁵ — tıklayınca kısa açıklama; klavye ve ekran okuyucu erişilebilir. */
export function TermSup({ n, title, definition, children }: { n: number; title: string; definition: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", h); };
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", whiteSpace: "nowrap" }}>
      {children}
      <sup>
        <button type="button" onClick={() => {
            // Yunus açıksa açıklamayı o anlatır
            if ((window as unknown as { __yunus?: boolean }).__yunus) { window.dispatchEvent(new CustomEvent("yunus:say", { detail: { title: `#${n} ${title}`, text: definition, link: `/terminoloji#t${n}`, linkLabel: "Sözlükte aç" } })); return; }
            setOpen(!open);
          }} aria-expanded={open} aria-label={`Terim ${n}: ${title} — açıklamayı göster`}
          style={{ border: 0, background: "none", padding: "0 1px", cursor: "pointer", color: "var(--orange)", font: "700 10px var(--mono)" }}>{n}</button>
      </sup>
      {open && (
        <span role="dialog" aria-label={title} style={{ position: "absolute", zIndex: 30, top: "1.6em", left: 0, width: 300, whiteSpace: "normal", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(6,26,64,.18)", padding: "10px 12px", fontSize: 12.5, fontWeight: 400, color: "var(--text)", textTransform: "none", letterSpacing: 0 }}>
          <b style={{ color: "var(--navy-800)" }}><span className="mono" style={{ color: "var(--orange)" }}>#{n}</span> {title}</b>
          <span style={{ display: "block", marginTop: 4 }}>{definition}</span>
          <a href={`/terminoloji#t${n}`} style={{ display: "block", marginTop: 6, fontSize: 12 }}>Sözlükte aç →</a>
        </span>
      )}
    </span>
  );
}
