"use client";
/**
 * Grafik bileşenleri — dataviz kuralları: ince çubuk (≤24px), 4px yuvarlak uç, 2px yüzey boşluğu,
 * kategorik renk sabit sırada, ≥2 seride lejant, metin asla seri renginde değil, her grafikte tablo görünümü,
 * işaret üzerinde ipucu (hover + klavye odağı). Etiketler React metni olarak basılır (innerHTML yok).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
export interface Series { name: string; slot?: number }
const fmtDefault = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
export type Format = "num" | "int" | "pct";
const FORMATS: Record<Format, (v: number) => string> = { num: fmtDefault, int: (v) => Math.round(v).toLocaleString("tr-TR"), pct: (v) => `%${Math.round(v * 100)}` };
function niceMax(v: number) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mn` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B` : fmtDefault(v));

interface Tip { x: number; y: number; head: string; rows: { name: string; value: string; color: string }[] }
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const el = tip ? (
    <div className="tip" style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 220), top: tip.y + 14 }} role="status">
      <div className="h">{tip.head}</div>
      {tip.rows.map((r) => <div className="r" key={r.name}><span><span className="k" style={{ background: r.color }} />{r.name}</span><b>{r.value}</b></div>)}
    </div>
  ) : null;
  return { tip: el, setTip };
}
function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return <div className="legend">{series.map((s, i) => <span key={s.name}><i style={{ background: SERIES[s.slot ?? i] }} />{s.name}</span>)}</div>;
}
function Frame({ title, note, table, children }: { title?: string; note?: ReactNode; table: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="chart">
      {title && <h3 style={{ marginBottom: 2 }}>{title}</h3>}
      <button type="button" className="btn secondary viewtoggle" style={{ padding: "2px 8px" }} onClick={() => setAsTable((x) => !x)} aria-pressed={asTable}>{asTable ? "Grafik" : "Tablo"}</button>
      {note && <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>{note}</div>}
      {asTable ? <div className="tablewrap" style={{ maxHeight: 360, overflow: "auto" }}>{table}</div> : children}
    </div>
  );
}

/** Dikey sütun (zaman/kategori), en fazla 4 yığın serisi */
export function Columns({ title, note, data, series, format = "num", unit = "", height = 200 }: { title?: string; note?: ReactNode; data: { key: string; label: string; values: number[]; href?: string }[]; series: Series[]; format?: Format; unit?: string; height?: number }) {
  const fmt = FORMATS[format];
  const router = useRouter();
  const { tip, setTip } = useTip();
  const W = 760, padL = 44, padB = 22, padT = 8, H = height;
  const max = niceMax(Math.max(0, ...data.map((d) => d.values.reduce((s, v) => s + Math.max(0, v), 0))));
  const band = (W - padL) / Math.max(1, data.length), bw = Math.min(24, band * 0.7);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const every = Math.ceil(data.length / 12);
  const table = <table><thead><tr><th>Dönem</th>{series.map((s) => <th key={s.name} className="numcell">{s.name}</th>)}</tr></thead><tbody>{data.map((d) => <tr key={d.key}><td>{d.href ? <Link href={d.href}>{d.label}</Link> : d.label}</td>{d.values.map((v, i) => <td key={i} className="numcell">{fmt(v)}{unit}</td>)}</tr>)}</tbody></table>;
  return (
    <Frame title={title} note={note} table={table}>
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} /><text className="ax" x={padL - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text></g>)}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          let acc = 0;
          const segs = d.values.map((v, si) => { const a = acc; acc += Math.max(0, v); return { si, a, b: acc, v }; }).filter((s) => s.b > s.a);
          const top = segs[segs.length - 1];
          return (
            <g key={d.key} className="mark" tabIndex={0} role={d.href ? "link" : undefined}
              onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, head: d.label, rows: series.map((s, si) => ({ name: s.name, value: `${fmt(d.values[si] ?? 0)}${unit}`, color: SERIES[s.slot ?? si] })) })}
              onPointerLeave={() => setTip(null)} onFocus={(e) => { const r = (e.target as SVGGElement).getBoundingClientRect(); setTip({ x: r.x, y: r.y, head: d.label, rows: series.map((s, si) => ({ name: s.name, value: `${fmt(d.values[si] ?? 0)}${unit}`, color: SERIES[s.slot ?? si] })) }); }} onBlur={() => setTip(null)}
              onClick={() => d.href && router.push(d.href)} onKeyDown={(e) => e.key === "Enter" && d.href && router.push(d.href)}>
              <rect x={cx - band / 2} y={padT} width={band} height={H - padT - padB} fill="transparent" />
              {segs.map((s) => {
                const isTop = s === top, y0 = y(s.b), h = Math.max(0, y(s.a) - y(s.b) - (s.a > 0 ? 2 : 0));
                return isTop
                  ? <path key={s.si} d={roundTop(cx - bw / 2, y0, bw, h, Math.min(4, h, bw / 2))} fill={SERIES[series[s.si]?.slot ?? s.si]} />
                  : <rect key={s.si} x={cx - bw / 2} y={y0} width={bw} height={h} fill={SERIES[series[s.si]?.slot ?? s.si]} />;
              })}
              {i % every === 0 && <text className="ax" x={cx} y={H - 6} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />
      </svg>
      {tip}
    </Frame>
  );
}
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Yatay çubuk listesi — kişi/araç karşılaştırması; değer uçta; en fazla 4 yığın serisi */
export function HBars({ title, note, rows, series, format = "num", unit = "", total: showTotal = true, maxRows = 40 }: { title?: string; note?: ReactNode; rows: { key: string; label: string; sub?: string; values: number[]; href?: string; flag?: string }[]; series: Series[]; format?: Format; unit?: string; total?: boolean; maxRows?: number }) {
  const fmt = FORMATS[format];
  const { tip, setTip } = useTip();
  const vis = rows.slice(0, maxRows);
  const max = niceMax(Math.max(0, ...vis.map((r) => r.values.reduce((s, v) => s + Math.max(0, v), 0))));
  const table = <table><thead><tr><th>Kayıt</th>{series.map((s) => <th key={s.name} className="numcell">{s.name}</th>)}{showTotal && series.length > 1 && <th className="numcell">Toplam</th>}</tr></thead><tbody>{rows.map((r) => <tr key={r.key}><td>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}{r.flag && <span className="badge grey" style={{ marginLeft: 6 }}>{r.flag}</span>}</td>{r.values.map((v, i) => <td key={i} className="numcell">{fmt(v)}{unit}</td>)}{showTotal && series.length > 1 && <td className="numcell">{fmt(r.values.reduce((a, b) => a + b, 0))}{unit}</td>}</tr>)}</tbody></table>;
  return (
    <Frame title={title} note={note} table={table}>
      <Legend series={series} />
      <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
        {vis.map((r) => {
          const tot = r.values.reduce((s, v) => s + Math.max(0, v), 0);
          const rowsTip = (e: { clientX: number; clientY: number }) => setTip({ x: e.clientX, y: e.clientY, head: r.label, rows: series.map((s, i) => ({ name: s.name, value: `${fmt(r.values[i] ?? 0)}${unit}`, color: SERIES[s.slot ?? i] })) });
          const bar = (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 34%) 1fr", gap: 10, alignItems: "center", fontSize: 12.5 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>{r.label}{r.sub && <span className="muted"> · {r.sub}</span>}{r.flag && <span className="badge grey" style={{ marginLeft: 6 }}>{r.flag}</span>}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", gap: 2, width: `${(tot / max) * 85}%`, height: 14 }}>
                  {r.values.map((v, i) => v > 0 && <div key={i} style={{ flex: v, background: SERIES[series[i]?.slot ?? i], borderRadius: i === r.values.length - 1 || r.values.slice(i + 1).every((x) => x <= 0) ? "0 4px 4px 0" : 0, minWidth: 2 }} />)}
                </div>
                <span className="muted" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(tot)}{unit}</span>
              </div>
            </div>
          );
          return r.href
            ? <Link key={r.key} href={r.href} className="mark" style={{ color: "inherit", textDecoration: "none" }} onPointerMove={rowsTip} onPointerLeave={() => setTip(null)} onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); rowsTip({ clientX: b.right - 200, clientY: b.y }); }} onBlur={() => setTip(null)}>{bar}</Link>
            : <div key={r.key} className="mark" tabIndex={0} onPointerMove={rowsTip} onPointerLeave={() => setTip(null)}>{bar}</div>;
        })}
        {rows.length > maxRows && <div className="muted" style={{ fontSize: 12 }}>+{rows.length - maxRows} kayıt daha — tablo görünümünde tamamı</div>}
      </div>
      {tip}
    </Frame>
  );
}

/** Isı haritası — tek renk sıralı skala; değeri olmayan (izin/kayıt yok) hücre taralı gösterilir */
export function Heatmap({ title, note, rows, cols, values, max, format = "num", unit = "", empty = "Kayıt yok / izin" }: { title?: string; note?: ReactNode; rows: { key: string; label: string; href?: string }[]; cols: { key: string; label: string }[]; values: (number | null)[][]; max?: number; format?: Format; unit?: string; empty?: string }) {
  const fmt = FORMATS[format];
  const { tip, setTip } = useTip();
  const M = max ?? Math.max(1, ...values.flat().map((v) => v ?? 0));
  const steps = ["var(--seq-100)", "var(--seq-200)", "var(--seq-300)", "var(--seq-400)", "var(--seq-500)", "var(--seq-600)", "var(--seq-700)"];
  const color = (v: number) => (v <= 0 ? "var(--surface-2)" : steps[Math.min(steps.length - 1, Math.floor((v / M) * steps.length))]);
  const table = <table><thead><tr><th />{cols.map((c) => <th key={c.key} className="numcell">{c.label}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.key}><td>{r.label}</td>{values[i].map((v, j) => <td key={j} className="numcell">{v == null ? "—" : fmt(v)}</td>)}</tr>)}</tbody></table>;
  return (
    <Frame title={title} note={note} table={table}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11.5, color: "var(--muted)", margin: "4px 0 8px" }}>
        <span>0</span>{steps.map((s) => <span key={s} style={{ width: 18, height: 10, background: s, borderRadius: 2 }} />)}<span>{fmt(M)}{unit}</span>
        <span className="hatch" style={{ width: 18, height: 10, borderRadius: 2, marginLeft: 12 }} /><span>{empty}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="hm">
          <thead><tr><th />{cols.map((c, j) => <th key={c.key}>{j % Math.ceil(cols.length / 16) === 0 ? c.label : ""}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.key}>
              <th>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</th>
              {values[i].map((v, j) => (
                <td key={j} className={`c ${v == null ? "hatch" : ""}`} style={v == null ? undefined : { background: color(v) }} tabIndex={-1}
                  onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, head: `${r.label} · ${cols[j].label}`, rows: [{ name: title ?? "Değer", value: v == null ? empty : `${fmt(v)}${unit}`, color: v == null ? "var(--border)" : color(v) }] })}
                  onPointerLeave={() => setTip(null)} aria-label={`${r.label} ${cols[j].label}: ${v == null ? empty : fmt(v) + unit}`} />
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {tip}
    </Frame>
  );
}
