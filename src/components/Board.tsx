"use client";
/** Kokpit kart düzeni: sürükleyip sıralama (fare + klavye), katlama, önemli göstergeleri sabitleme. Düzen kişiye özel saklanır. */
import { useEffect, useState, type ReactNode } from "react";

export interface BoardCard { id: string; title: string; span?: 1 | 2 | 3 | 4; kind?: "kpi" | "panel"; node: ReactNode }
interface Layout { order: string[]; collapsed: string[]; pinned: string[] }

export function Board({ cards, storageKey }: { cards: BoardCard[]; storageKey: string }) {
  const def: Layout = { order: cards.map((c) => c.id), collapsed: [], pinned: [] };
  const [l, setL] = useState<Layout>(def);
  const [drag, setDrag] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(storageKey) ?? "null"); if (s) setL({ ...def, ...s, order: [...s.order.filter((x: string) => cards.some((c) => c.id === x)), ...cards.map((c) => c.id).filter((x) => !s.order.includes(x))] }); } catch { /* */ } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const save = (n: Layout) => { setL(n); try { localStorage.setItem(storageKey, JSON.stringify(n)); } catch { /* */ } };
  const move = (id: string, d: number) => { const o = [...l.order]; const i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; save({ ...l, order: o }); };
  const toggle = (k: "collapsed" | "pinned", id: string) => save({ ...l, [k]: l[k].includes(id) ? l[k].filter((x) => x !== id) : [...l[k], id] });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const pinned = l.order.filter((id) => l.pinned.includes(id));
  const rest = l.order.filter((id) => !l.pinned.includes(id));
  const render = (id: string) => {
    const c = byId.get(id); if (!c) return null;
    const col = l.collapsed.includes(id);
    return (
      <section key={id} draggable={edit} onDragStart={() => setDrag(id)} onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={() => { if (!drag || drag === id) return; const o = l.order.filter((x) => x !== drag); o.splice(o.indexOf(id), 0, drag); save({ ...l, order: o }); setDrag(null); }}
        aria-label={c.title} style={{ gridColumn: `span ${c.span ?? 1}`, outline: edit ? "1px dashed var(--border)" : undefined, outlineOffset: 4, borderRadius: "var(--radius)", opacity: drag === id ? 0.5 : 1, minWidth: 0 }}>
        {(edit || c.kind !== "kpi") && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
            {edit && <span aria-hidden style={{ cursor: "grab", color: "var(--muted)" }}>⋮⋮</span>}
            <button type="button" onClick={() => toggle("collapsed", id)} aria-expanded={!col} style={{ border: 0, background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: 0, textAlign: "left", flex: 1 }}>{col ? "▸" : "▾"} {c.title}</button>
            {edit && <><button type="button" className="btn secondary" style={{ minHeight: 24, padding: "0 6px" }} aria-label={`${c.title} öne al`} onClick={() => move(id, -1)}>←</button><button type="button" className="btn secondary" style={{ minHeight: 24, padding: "0 6px" }} aria-label={`${c.title} sona al`} onClick={() => move(id, 1)}>→</button></>}
            {c.kind === "kpi" && <button type="button" className="btn secondary" style={{ minHeight: 24, padding: "0 6px" }} aria-pressed={l.pinned.includes(id)} title="Üst şeride sabitle" onClick={() => toggle("pinned", id)}>{l.pinned.includes(id) ? "📌" : "📍"}</button>}
          </div>
        )}
        {!col && c.node}
      </section>
    );
  };
  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
        <button type="button" className="btn secondary" aria-pressed={edit} onClick={() => setEdit((x) => !x)}>{edit ? "✓ Düzenlemeyi bitir" : "⚙ Kokpiti düzenle"}</button>
        {edit && <button type="button" className="btn secondary" onClick={() => save(def)}>Varsayılan düzen</button>}
      </div>
      {pinned.length > 0 && <div className="grid g4" style={{ marginBottom: 14, position: "sticky", top: 64, zIndex: 3, padding: 6, background: "var(--bg)", borderRadius: "var(--radius)" }} aria-label="Sabitlenmiş göstergeler">{pinned.map(render)}</div>}
      <div className="grid g4">{rest.map(render)}</div>
      {edit && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Kartları sürükleyip bırakın veya ← → ile taşıyın; ▾ ile katlayın; 📍 ile göstergeyi üst şeride sabitleyin. Düzen bu tarayıcıda size özel saklanır.</div>}
    </div>
  );
}
