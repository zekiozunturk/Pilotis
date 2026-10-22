"use client";
import { useMemo, useState, useActionState, useEffect, Fragment } from "react";
import { reviewTranslation, addTerm, editTerm, type TState } from "./actions";
import { LANGS } from "@/data/terms";

type T = { n: number; slug: string; tr: string; aliases: string[]; definition: string; source: string | null; confused: string | null; status: string; version: number; translations: Record<string, { text: string; reviewed: boolean; reviewer?: string }> };

function Confused({ text }: { text: string }) {
  const parts = text.split(/(#\d+)/g);
  return <>{parts.map((p, i) => /^#\d+$/.test(p) ? <a key={i} href={`#t${p.slice(1)}`} className="mono">{p}</a> : <Fragment key={i}>{p}</Fragment>)}</>;
}

function Review({ n, lang, text }: { n: number; lang: string; text: string }) {
  const [st, act, pending] = useActionState<TState, FormData>(reviewTranslation, null);
  return (
    <details style={{ display: "inline-block" }}>
      <summary style={{ cursor: "pointer", fontSize: 11 }}>onayla</summary>
      <form action={act} style={{ display: "grid", gap: 4, marginTop: 4, minWidth: 220 }}>
        <input type="hidden" name="n" value={n} /><input type="hidden" name="lang" value={lang} />
        <input name="text" defaultValue={text} dir={lang === "ar" ? "rtl" : "ltr"} style={{ padding: "3px 6px" }} />
        <input name="reviewer" placeholder="Kontrol eden ad / unvan *" required style={{ padding: "3px 6px" }} />
        <button className="btn secondary" style={{ minHeight: 26, padding: "2px 8px" }} disabled={pending}>Onayla</button>
        {st && <span style={{ fontSize: 11, color: st.ok ? "var(--ok)" : "var(--bad)" }}>{st.message}</span>}
      </form>
    </details>
  );
}

function Edit({ t }: { t: T }) {
  const [st, act, pending] = useActionState<TState, FormData>(editTerm, null);
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--navy-700)" }}>✎ düzenle (v{t.version})</summary>
      <form action={act} style={{ marginTop: 6, display: "grid", gap: 6, background: "var(--bg)", padding: 8, borderRadius: 8 }}>
        <input type="hidden" name="n" value={t.n} />
        <div><label>Türkçe terim *</label><input name="tr" defaultValue={t.tr} required /></div>
        <div><label>İşletme karşılıkları (virgülle)</label><input name="aliases" defaultValue={t.aliases.join(", ")} /></div>
        <div><label>Tanım *</label><textarea name="definition" defaultValue={t.definition} rows={3} required /></div>
        <div><label>Kaynak</label><input name="source" defaultValue={t.source ?? ""} /></div>
        <div><label>Karıştırılan (#no ile)</label><input name="confused" defaultValue={t.confused ?? ""} /></div>
        {LANGS.filter((l) => l.code !== "tr").map((l) => <div key={l.code}><label>{l.label}{t.translations[l.code]?.reviewed ? " (onaylı — değişirse onay düşer)" : " (taslak)"}</label><input name={`t_${l.code}`} dir={l.dir} defaultValue={t.translations[l.code]?.text ?? ""} /></div>)}
        <div><label>Değişiklik notu *</label><input name="changeNote" placeholder="ör. İşletme tanımına göre düzeltildi" required /></div>
        <button className="btn secondary" disabled={pending}>Kaydet</button>
        {st && <span role="status" style={{ fontSize: 11.5, color: st.ok ? "var(--ok)" : "var(--bad)" }}>{st.message}</span>}
      </form>
    </details>
  );
}

export function Glossary({ terms, canEdit }: { terms: T[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [langs, setLangs] = useState<string[]>(["en", "de", "it", "nb", "ar"]);
  const [st, add, adding] = useActionState<TState, FormData>(addTerm, null);
  useEffect(() => {
    const f = () => { if (window.location.hash === "#yeni-terim") { const d = document.getElementById("yeni-terim") as HTMLDetailsElement | null; if (d) { d.open = true; d.querySelector("input")?.focus(); } } };
    f(); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f);
  }, []);
  const shown = useMemo(() => {
    const k = q.trim().toLocaleLowerCase("tr");
    if (!k) return terms;
    return terms.filter((t) => [String(t.n), t.tr, ...t.aliases, t.definition, ...Object.values(t.translations).map((x) => x.text)].some((x) => x.toLocaleLowerCase("tr").includes(k)));
  }, [q, terms]);
  return (
    <>
      {canEdit ? (
      <details className="card" id="yeni-terim" style={{ marginBottom: 12, borderColor: "var(--orange)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--orange)" }}>+ Yeni terim ekle (elle)</summary>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Numara otomatik ve kalıcı verilir. Çeviriler taslak olarak kaydedilir; onay için kontrol eden kişinin adı gerekir.</div>
        <form action={add} style={{ marginTop: 10 }}>
          <div className="grid g3" style={{ gap: 8 }}>
            <div><label>Türkçe terim *</label><input name="tr" required /></div>
            <div><label>İşletme karşılıkları (virgülle)</label><input name="aliases" /></div>
            <div><label>Kaynak</label><input name="source" /></div>
            <div style={{ gridColumn: "span 2" }}><label>Tanım *</label><input name="definition" required /></div>
            <div><label>Karıştırılan (#no ile)</label><input name="confused" placeholder="ör. Römorkörcülük (#3)" /></div>
            {LANGS.filter((l) => l.code !== "tr").map((l) => <div key={l.code}><label>{l.label} (taslak)</label><input name={l.code} dir={l.dir} /></div>)}
          </div>
          <button className="btn" style={{ marginTop: 8 }} disabled={adding}>Ekle</button>
          {st && <span role="status" style={{ marginLeft: 10, fontSize: 12, color: st.ok ? "var(--ok)" : "var(--bad)" }}>{st.message}</span>}
        </form>
      </details>
      ) : <div className="alert info" style={{ marginBottom: 12 }}><span>ⓘ</span><div>Terim eklemek veya düzenlemek için tarife/mevzuat sorumlusu, operasyon ya da işletme yöneticisi rolü gerekir.</div></div>}
      <div className="card" style={{ marginBottom: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 260px" }}><label>Ara (terim, karşılık, tanım, çeviri, numara)</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ör. palamar, tug, Schlepper, 13" /></div>
        <div><label>Gösterilen diller</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{LANGS.filter((l) => l.code !== "tr").map((l) => <label key={l.code} className="check"><input type="checkbox" checked={langs.includes(l.code)} onChange={(e) => setLangs(e.target.checked ? [...langs, l.code] : langs.filter((x) => x !== l.code))} /> {l.label}</label>)}</div>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{shown.length} / {terms.length}</span>
      </div>
      <div className="tablewrap">
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th style={{ width: 50 }}>No</th><th style={{ minWidth: 260 }}>Türkçe terim · tanım</th>{LANGS.filter((l) => langs.includes(l.code)).map((l) => <th key={l.code} style={{ minWidth: 140, textAlign: l.dir === "rtl" ? "right" : "left" }}>{l.label}</th>)}</tr></thead>
          <tbody>{shown.map((t) => (
            <tr key={t.n} id={`t${t.n}`}>
              <td className="mono" style={{ color: "var(--orange)", fontWeight: 800 }}>#{t.n}</td>
              <td>
                <b style={{ fontSize: 13.5, color: "var(--navy-800)" }}>{t.tr}</b>{t.aliases.length > 0 && <span className="muted"> · işletmede: {t.aliases.join(", ")}</span>}
                <div style={{ marginTop: 2 }}>{t.definition}</div>
                {t.confused && <div style={{ fontSize: 11.5, marginTop: 2 }}><span className="badge warn">Karıştırılmamalı</span> <Confused text={t.confused} /></div>}
                {t.source && <div className="muted" style={{ fontSize: 11 }}>Kaynak: {t.source}</div>}
                {canEdit && <Edit t={t} />}
              </td>
              {LANGS.filter((l) => langs.includes(l.code)).map((l) => {
                const x = t.translations[l.code];
                return <td key={l.code} dir={l.dir} style={{ textAlign: l.dir === "rtl" ? "right" : "left", fontFamily: l.code === "ar" ? "'Noto Naskh Arabic','Segoe UI',sans-serif" : undefined }}>
                  <div style={{ fontSize: l.code === "ar" ? 14 : 12.5 }}>{x?.text ?? "—"}</div>
                  <div dir="ltr" style={{ textAlign: "left" }}>{x?.reviewed ? <span className="badge ok" title={x.reviewer}>✓ onaylı</span> : <><span className="badge grey">taslak</span> <Review n={t.n} lang={l.code} text={x?.text ?? ""} /></>}</div>
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
