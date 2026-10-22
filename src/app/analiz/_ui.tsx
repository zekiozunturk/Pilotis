import Link from "next/link";
import type { ReactNode } from "react";
import { TABS } from "@/lib/analytics/access";
import { BASIS_LABEL, GRAIN_LABEL } from "@/lib/analytics/model";
import type { Quality } from "@/lib/analytics/insights";
import { FilterBar, type FilterOptions } from "./filters";
import { type Analysis, qs, dd } from "./_lib";
import { ROLE_LABELS } from "@/lib/session";

const ROLE_TR: Record<string, string> = { KAPTAN: "Römorkör kaptanı", BASCARKCI: "Başçarkçı", YAGCI: "Yağcı", PIMCI: "Pimci", KILAVUZ: "Kılavuz kaptan", KIYI_OPS: "Kıyı operasyon" };
export const roleTr = (r: string | null) => (r ? ROLE_TR[r] ?? r : "—");
const ASSET_TR: Record<string, string> = { TUG: "Römorkör", PILOT_BOAT: "Kılavuz botu", MOORING_BOAT: "Palamar botu", SURFACE_CLEANING_VESSEL: "Temizlik teknesi" };
export const assetTr = (t: string) => ASSET_TR[t] ?? t;

export function AnalysisHeader({ a, tab, title, sub, q, actions }: { a: Analysis; tab: string; title: string; sub?: ReactNode; q?: Quality; actions?: ReactNode }) {
  const { ds, access } = a;
  const visiblePersons = a.sc.persons;
  const opts: FilterOptions = {
    persons: (access.people === "ALL" ? ds.persons : visiblePersons).map((p) => ({ v: p.id, l: p.name.replace("ÖRNEK ", "") })),
    roles: Object.entries(ROLE_TR).map(([v, l]) => ({ v, l })),
    teams: [...new Set(ds.persons.map((p) => p.teamKey).filter(Boolean) as string[])].sort((x, y) => x.localeCompare(y, "tr", { numeric: true })).map((v) => ({ v, l: v })),
    assets: ds.assets.map((x) => ({ v: x.id, l: x.code ? `${x.code} · ${x.name}` : x.name })),
    assetTypes: [...new Set(ds.assets.map((x) => x.type))].map((v) => ({ v, l: assetTr(v) })),
    opTypes: [...new Map(ds.ops.map((o) => [o.typeCode, o.typeName])).entries()].sort().map(([v, l]) => ({ v, l: `${v} · ${l}` })),
    vessels: [...new Map(ds.ops.map((o) => [o.vesselId, o.vesselName])).entries()].map(([v, l]) => ({ v, l: l.replace("ÖRNEK ", "") })).sort((x, y) => x.l.localeCompare(y.l, "tr")),
    parties: [...new Set(ds.ops.map((o) => o.billingPartyId).filter(Boolean) as string[])].map((v) => ({ v, l: (ds.parties[v] ?? v).replace("ÖRNEK ", "") })),
    agents: [...new Set(ds.ops.map((o) => o.agentPartyId).filter(Boolean) as string[])].map((v) => ({ v, l: (ds.parties[v] ?? v).replace("ÖRNEK ", "") })),
    facilities: [...new Set(ds.ops.map((o) => o.facilityId).filter(Boolean) as string[])].map((v) => ({ v, l: (ds.facilities[v] ?? v).replace("ÖRNEK ", "") })),
    finance: access.finance, restrictedPeople: access.people !== "ALL",
  };
  const tabs = TABS.filter((t) => t.need(access));
  return (
    <>
      <div className="pagehead" style={{ marginBottom: 10 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }}>Performans ve Operasyon Analiz Merkezi</div>
          <h1 style={{ margin: "2px 0 0" }}>{title}</h1>
          {sub && <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{sub}</div>}
        </div>
        <div className="toolbar">{actions}</div>
      </div>
      <nav className="atabs" aria-label="Analiz sekmeleri">{tabs.map((t) => <Link key={t.href} href={`${t.href}${qs(a.sp)}`} className={tab === t.href ? "on" : ""}>{t.label}</Link>)}</nav>
      <FilterBar opts={opts} />
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Dönem <b>{dd(a.f.from)} – {dd(a.f.to - 1)}</b> · Gruplama {GRAIN_LABEL[a.f.grain]} · Tarih esası <b>{BASIS_LABEL[a.f.basis]}</b>
        {a.cmp && <> · Karşılaştırma {dd(a.cmp.from)} – {dd(a.cmp.to - 1)}</>} · Erişim: {access.label} ({ROLE_LABELS[a.role]})
        {a.scopeNote && <> · <b>{a.scopeNote}</b></>}
      </div>
      {a.ds.ops.some((o) => o.ref) && <div className="alert warn" style={{ marginBottom: 10, fontSize: 12 }}><span>ⓘ</span><div><b>ÖRNEK veri</b>Gösterilen operasyon, fatura, tahsilat ve maliyet kayıtları örnek dönem verisidir (31.08–24.10.2026); tutarlar resmî tarife ve TCMB kuruyla hesaplanmamıştır. Gerçek veri muhasebe aktarımı ve saha kayıtlarıyla gelir.</div></div>}
      {q && <QualityStrip q={q} asOf={a.ds.asOf} />}
    </>
  );
}

export function QualityStrip({ q, asOf }: { q: Quality; asOf: number }) {
  const t = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div className="qstrip" id="kalite" aria-label="Veri kalitesi">
      <span>Hesaplama <b>{t(asOf)}</b></span>
      <span>Saha olayları <b>{t(q.lastUpdates.events)}</b></span>
      <span>Muhasebe aktarımı <b>{t(q.lastUpdates.accounting)}</b></span>
      <span>Eksik zaman kaydı <b>{q.missingRecords}</b></span>
      <span>Onay bekleyen <b>{q.pendingHours.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} sa</b></span>
      <span>Finansal eşleşme <b>{q.financialMatchRate == null ? "—" : `%${Math.round(q.financialMatchRate * 100)}`}</b></span>
      <span>Tahsilat eşleşme <b>{q.paymentMatchRate == null ? "—" : `%${Math.round(q.paymentMatchRate * 100)}`}</b></span>
      <span>Tahmini maliyet payı <b>{q.estimateShare == null ? "—" : `%${Math.round(q.estimateShare * 100)}`}</b></span>
      <span>Elle düzeltme <b>{q.manualCorrections}</b></span>
      <span>Eşzamanlı kayıt <b>{q.overlaps}</b></span>
    </div>
  );
}

/** Gösterge kutusu — karşılaştırma dönemine göre değişim (yönü iyi/kötü ayrımıyla) */
export function Tile({ l, v, prev, cur, good = "up", fmt, note, href }: { l: string; v: ReactNode; prev?: number | null; cur?: number; good?: "up" | "down" | "none"; fmt?: (x: number) => string; note?: ReactNode; href?: string }) {
  let delta: ReactNode = null;
  if (prev != null && cur != null && prev !== 0) {
    const d = (cur - prev) / Math.abs(prev);
    const cls = good === "none" || Math.abs(d) < 0.005 ? "" : (d > 0) === (good === "up") ? "up" : "down";
    delta = <div className={`d ${cls}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "■"} %{Math.abs(d * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} önceki döneme göre{fmt ? ` (${fmt(prev)})` : ""}</div>;
  } else if (prev === 0 && cur) delta = <div className="d">Önceki dönemde 0</div>;
  const body = <><div className="l">{l}</div><div className="v">{v}</div>{delta}{note && <div className="d">{note}</div>}</>;
  return href ? <Link href={href} className="tile" style={{ color: "inherit", textDecoration: "none" }}>{body}</Link> : <div className="tile">{body}</div>;
}

/** Excel çıktısıyla aynı tanımdan ekran tablosu — toplam satırı aynı kolonlarda */
export function SheetTable({ sheet, linkCol, links, maxRows = 400, highlight }: { sheet: { columns: { key: string; header: string; type: string; total?: boolean; note?: string }[]; rows: Record<string, unknown>[]; caption?: string }; linkCol?: string; links?: Record<string, string>; maxRows?: number; highlight?: (r: Record<string, unknown>) => boolean }) {
  const f = (v: unknown, t: string) => {
    if (v == null || v === "") return "—";
    if (t === "money") return (v as number).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (t === "hours" || t === "number") return (v as number).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
    if (t === "int") return (v as number).toLocaleString("tr-TR");
    if (t === "pct") return `%${Math.round((v as number) * 100)}`;
    if (t === "datetime") return new Date(v as number).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return String(v);
  };
  const num = (t: string) => ["money", "hours", "number", "int", "pct"].includes(t);
  const totals = sheet.columns.map((c) => (c.total ? sheet.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0) : null));
  return (
    <>
      {sheet.caption && <div className="muted" style={{ fontSize: 11.5, margin: "4px 0 6px" }}>{sheet.caption}</div>}
      <div className="tablewrap" style={{ maxHeight: 560, overflow: "auto" }}>
        <table>
          <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}><tr>{sheet.columns.map((c) => <th key={c.key} className={num(c.type) ? "numcell" : ""} title={c.note}>{c.header}{c.note ? " ⓘ" : ""}</th>)}</tr></thead>
          <tbody>
            {sheet.rows.slice(0, maxRows).map((r, i) => (
              <tr key={String(r._id ?? i)} style={highlight?.(r) ? { background: "var(--warn-bg)" } : undefined}>
                {sheet.columns.map((c, j) => <td key={c.key} className={num(c.type) ? "numcell" : ""}>{j === 0 && links && r._id && links[String(r._id)] ? <Link href={links[String(r._id)]}>{f(r[c.key], c.type)}</Link> : c.key === linkCol && links ? <Link href={links[String(r[c.key])] ?? "#"}>{f(r[c.key], c.type)}</Link> : f(r[c.key], c.type)}{j === 0 && typeof r._flag === "string" && r._flag ? <span className="badge grey" style={{ marginLeft: 6 }}>{r._flag}</span> : null}</td>)}
              </tr>
            ))}
          </tbody>
          {totals.some((t) => t != null) && <tfoot><tr style={{ fontWeight: 700, background: "var(--surface-2)" }}>{sheet.columns.map((c, j) => <td key={c.key} className={num(c.type) ? "numcell" : ""}>{j === 0 ? "Toplam" : totals[j] == null ? "" : f(totals[j], c.type)}</td>)}</tr></tfoot>}
        </table>
      </div>
      {sheet.rows.length > maxRows && <div className="muted" style={{ fontSize: 12 }}>İlk {maxRows} satır gösteriliyor ({sheet.rows.length} kayıt) — tamamı Excel çıktısında.</div>}
    </>
  );
}
