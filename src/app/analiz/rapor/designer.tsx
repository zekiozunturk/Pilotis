"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { runReport, validateDef, dimsOf, measuresOf, EMPTY_DEF, AGG_LABEL, DATASET_LABEL, type ReportDef, type Field, type DatasetKey, type Agg } from "@/lib/analytics/report";
import { HBars } from "@/components/charts";
import { SaveStatus, useAutoDraft, useLeaveGuard, useOnline, DraftBanner, newRequestId, type SaveState } from "@/components/save-state";
import { saveReport, copyReport, archiveReport, createSnapshot, createSchedule, type RState } from "./actions";

type Saved = { id: string; kind: "TEMPLATE" | "VIEW" | "SNAPSHOT"; name: string; scope: string; owner: string; ownerRole: string; version: number; def: ReportDef; filters: string | null; updatedAt: string; reportNo: string | null; rowsCount: number | null };
type Sched = { id: string; reportId: string; frequency: string; at: string; recipients: string; format: string; dataScope: string; lastResult: string | null };
const KIND: Record<string, string> = { TEMPLATE: "Şablon", VIEW: "Kayıtlı görünüm", SNAPSHOT: "Sabit nüsha" };
const SCOPE: Record<string, string> = { PERSONAL: "Kişisel", TEAM: "Ekip", CORPORATE: "Kurumsal" };

function fmt(v: unknown, t: string) {
  if (v == null || v === "") return "—";
  if (t === "money") return Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  if (t === "hours" || t === "number") return Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  if (t === "int") return Number(v).toLocaleString("tr-TR");
  if (t === "pct") return `%${(Number(v) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
  if (t === "datetime") return new Date(Number(v)).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return String(v);
}

export function Designer({ data, role, filters, saved, schedules, ready, canCorporate, openId }: { data: Partial<Record<DatasetKey, { fields: Field[]; rows: Record<string, unknown>[] }>>; role: string; filters: string; saved: Saved[]; schedules: Sched[]; ready: { key: string; title: string; def: Partial<ReportDef> | null; href: string | null }[]; canCorporate: boolean; openId: string | null }) {
  const router = useRouter();
  const datasets = Object.keys(data) as DatasetKey[];
  const initial = saved.find((x) => x.id === openId);
  const [def, setDef] = useState<ReportDef>(() => initial?.def ?? { ...EMPTY_DEF, dataset: datasets.includes("ops") ? "ops" : datasets[0], groupBy: datasets.includes("ops") ? "type" : null });
  const [current, setCurrent] = useState<Saved | null>(initial ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [scope, setScope] = useState(initial?.scope ?? "PERSONAL");
  const [state, setState] = useState<SaveState>({ k: "idle" });
  const [conflict, setConflict] = useState<NonNullable<RState>["conflict"] | null>(null);
  const [pending, start] = useTransition();
  const [snapMsg, setSnapMsg] = useState<RState>(null);
  const inflight = useRef<string | null>(null);
  const online = useOnline();
  const ds = data[def.dataset];
  const fields = useMemo(() => ds?.fields ?? [], [ds]);
  const dims = dimsOf(fields), meas = measuresOf(fields);
  const errs = ds ? validateDef(def, fields) : ["Veri kümesine erişim yok"];
  const out = useMemo(() => (ds && !errs.length ? runReport(def, ds.rows, fields) : null), [def, ds, fields, errs.length]);
  const dirty = state.k === "dirty" || state.k === "local" || state.k === "failed" || state.k === "offline";
  useLeaveGuard(dirty);
  const draft = useAutoDraft<{ def: ReportDef; name: string; scope: string }>(`rapor.${current?.id ?? "yeni"}`, { def, name, scope }, { owner: role, recordId: current?.id ?? null, enabled: dirty });
  const upd = (p: Partial<ReportDef>) => { setDef((d) => ({ ...d, ...p })); setState(online ? { k: "dirty" } : { k: "offline" }); };
  const move = <T,>(xs: T[], i: number, d: number) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return ys; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; };

  const doSave = (kind: "TEMPLATE" | "VIEW", force = false) => {
    if (inflight.current) return; // çift tıklama
    if (!online) { setState({ k: "offline" }); return; }
    const requestId = newRequestId(); inflight.current = requestId;
    setState({ k: "saving" });
    start(async () => {
      try {
        const r = await saveReport({ id: current && current.kind === kind ? current.id : undefined, kind, name: name || def.title, scope, def, filters, expectedVersion: current?.version, requestId, force });
        if (r?.ok) { setState({ k: "saved", at: new Date(), note: r.message }); setConflict(null); draft.discard(); setCurrent((c) => ({ ...(c ?? ({} as Saved)), id: r.id!, kind, name: name || def.title, scope, version: r.version ?? 1, def, filters, owner: "", ownerRole: role, updatedAt: new Date().toISOString(), reportNo: null, rowsCount: null })); router.refresh(); }
        else if (r?.conflict) { setConflict(r.conflict); setState({ k: "conflict", msg: r.message }); }
        else setState({ k: "failed", msg: r?.message ?? "bilinmeyen hata" });
      } catch { setState({ k: navigator.onLine ? "failed" : "offline", msg: "Sunucuya ulaşılamadı — değişiklikler cihazda" } as SaveState); }
      finally { inflight.current = null; }
    });
  };
  const doSnapshot = () => {
    if (inflight.current) return;
    const requestId = newRequestId(); inflight.current = requestId;
    start(async () => { try { setSnapMsg(await createSnapshot({ name: `${name || def.title} — ${new Date().toLocaleDateString("tr-TR")}`, scope, def, filters, requestId, sourceId: current?.id })); router.refresh(); } finally { inflight.current = null; } });
  };
  const open = (r: Saved) => { setDef(r.def); setCurrent(r); setName(r.name); setScope(r.scope); setState({ k: "idle" }); setConflict(null); if (r.kind === "VIEW" && r.filters != null && r.filters !== filters) router.push(`/analiz/rapor?${r.filters}&rapor=${r.id}`); };
  const loadReady = (r: { def: Partial<ReportDef> | null; title: string }) => { setDef({ ...EMPTY_DEF, ...(r.def ?? {}) }); setCurrent(null); setName(r.title); setState({ k: "dirty" }); };
  const exportHref = (format: "xlsx" | "pdf") => (current?.kind === "SNAPSHOT" ? `/api/rapor/export?format=${format}&id=${current.id}` : `/api/rapor/export?format=${format}&filters=${encodeURIComponent(filters)}&def=${btoa(unescape(encodeURIComponent(JSON.stringify(def)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`);
  const isSnap = current?.kind === "SNAPSHOT";
  const chartField = out?.columns[1];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 16 }}>
      <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: 13 }}>Hazır raporlar</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12.5, display: "grid", gap: 4 }}>
            {ready.map((r) => <li key={r.key}>{r.href ? <Link href={r.href}>↗ {r.title}</Link> : <button type="button" className="linkbtn" onClick={() => loadReady(r)} style={{ background: "none", border: 0, color: "var(--navy-700)", cursor: "pointer", padding: 0, textAlign: "left" }}>▸ {r.title}</button>}</li>)}
          </ul>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: 13 }}>Kayıtlı raporlar ({saved.length})</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12.5, display: "grid", gap: 6, maxHeight: 420, overflow: "auto" }}>
            {saved.map((r) => (
              <li key={r.id} style={{ borderLeft: current?.id === r.id ? "3px solid var(--orange)" : "3px solid transparent", paddingLeft: 6 }}>
                <button type="button" onClick={() => open(r)} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--navy-800)", fontWeight: 600, textAlign: "left" }}>{r.name}</button>
                <div className="muted" style={{ fontSize: 11 }}>{KIND[r.kind]} · {SCOPE[r.scope]} · {r.owner}{r.kind !== "SNAPSHOT" ? ` · v${r.version}` : ` · ${r.reportNo} · ${r.rowsCount} satır`}</div>
              </li>
            ))}
            {!saved.length && <li className="muted">Henüz kayıtlı rapor yok</li>}
          </ul>
        </div>
      </aside>
      <section style={{ display: "grid", gap: 12, minWidth: 0 }}>
        {draft.restorable && !dirty && <DraftBanner draft={draft.restorable} onResume={() => { setDef(draft.restorable!.v.def); setName(draft.restorable!.v.name); setScope(draft.restorable!.v.scope); setState({ k: "local", at: new Date(draft.restorable!.at) }); draft.dismiss(); }} onDiscard={draft.discard}
          compare={(v) => <div style={{ fontSize: 12 }}>Taslak: <b>{v.def.title}</b> · {v.def.measures.length} ölçüm · gruplama {v.def.groupBy ?? "yok"} — Sunucudaki: <b>{current?.def.title ?? "(kaydedilmemiş)"}</b> · {current?.def.measures.length ?? 0} ölçüm · gruplama {current?.def.groupBy ?? "yok"}</div>} />}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>{current ? `${KIND[current.kind]}: ${current.name}` : "Yeni rapor"}</h3>
            <SaveStatus s={isSnap ? { k: "saved", at: new Date(current!.updatedAt), note: "sabit nüsha — değiştirilemez" } : state.k === "local" ? state : dirty && draft.lastLocal ? { k: "local", at: draft.lastLocal } : state} />
          </div>
          {isSnap && <div className="alert info" style={{ marginTop: 8 }}><span>🔒</span><div><b>Sabit nüsha</b>Bu çıktı {current!.reportNo} kimliğiyle üretildiği andaki veriyi taşır; veri sonradan değişse de değişmez. Düzenlemek için “Kopyasını oluştur”.</div></div>}
          <fieldset disabled={isSnap} style={{ border: 0, padding: 0, margin: "10px 0 0", display: "grid", gap: 10 }}>
            <div className="grid g3" style={{ gap: 10 }}>
              <div><label htmlFor="r-t">Başlık</label><input id="r-t" value={def.title} onChange={(e) => upd({ title: e.target.value })} /></div>
              <div><label htmlFor="r-ds">Veri kümesi</label><select id="r-ds" value={def.dataset} onChange={(e) => { const k = e.target.value as DatasetKey; upd({ dataset: k, groupBy: dimsOf(data[k]!.fields)[1]?.key ?? null, pivot: null, measures: [{ key: "_count", agg: "count" }], ratios: [], sort: null }); }}>{datasets.map((d) => <option key={d} value={d}>{DATASET_LABEL[d]}</option>)}</select></div>
              <div><label htmlFor="r-g">Gruplama</label><select id="r-g" value={def.groupBy ?? ""} onChange={(e) => upd({ groupBy: e.target.value || null, pivot: e.target.value ? def.pivot : null, sort: null })}><option value="">Detay (gruplama yok)</option>{dims.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              <div><label htmlFor="r-p">Pivot kolonu (ilk ölçüm için)</label><select id="r-p" value={def.pivot ?? ""} onChange={(e) => upd({ pivot: e.target.value || null })} disabled={!def.groupBy}><option value="">Yok</option>{dims.filter((f) => f.key !== def.groupBy).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              <div><label htmlFor="r-s">Sıralama</label><div style={{ display: "flex", gap: 4 }}><select id="r-s" value={def.sort?.col ?? ""} onChange={(e) => upd({ sort: e.target.value ? { col: e.target.value, dir: def.sort?.dir ?? "desc" } : null })} style={{ flex: 1 }}><option value="">Varsayılan</option>{out?.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select><select aria-label="Yön" value={def.sort?.dir ?? "desc"} onChange={(e) => def.sort && upd({ sort: { ...def.sort, dir: e.target.value as "asc" } })} style={{ width: 90 }}><option value="desc">Azalan</option><option value="asc">Artan</option></select></div></div>
              <div><label htmlFor="r-l">Satır sınırı</label><input id="r-l" type="number" min={1} value={def.limit ?? ""} placeholder="Tümü" onChange={(e) => upd({ limit: e.target.value ? Number(e.target.value) : null })} /></div>
            </div>
            <div>
              <label>Ölçümler (kolon sırası)</label>
              <div style={{ display: "grid", gap: 4 }}>
                {def.measures.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <select aria-label="Ölçüm" value={m.key} onChange={(e) => upd({ measures: def.measures.map((x, j) => (j === i ? { key: e.target.value, agg: e.target.value === "_count" ? "count" : x.agg === "count" ? "sum" : x.agg } : x)) })} style={{ flex: 1 }}><option value="_count">Kayıt sayısı</option>{meas.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
                    <select aria-label="Hesaplama" value={m.agg} onChange={(e) => upd({ measures: def.measures.map((x, j) => (j === i ? { ...x, agg: e.target.value as Agg } : x)) })} style={{ width: 120 }} disabled={m.key === "_count"}>{(Object.keys(AGG_LABEL) as Agg[]).map((a) => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}</select>
                    <button type="button" className="btn secondary" aria-label="Yukarı" onClick={() => upd({ measures: move(def.measures, i, -1) })}>↑</button>
                    <button type="button" className="btn secondary" aria-label="Aşağı" onClick={() => upd({ measures: move(def.measures, i, 1) })}>↓</button>
                    <button type="button" className="btn danger" aria-label="Kaldır" onClick={() => upd({ measures: def.measures.filter((_, j) => j !== i), ratios: def.ratios.filter((r) => r.num !== m.key && r.den !== m.key) })}>×</button>
                  </div>
                ))}
                <div><button type="button" className="btn secondary" onClick={() => upd({ measures: [...def.measures, { key: meas[0]?.key ?? "_count", agg: meas[0] ? "sum" : "count" }] })}>+ Ölçüm ekle</button></div>
              </div>
            </div>
            <div>
              <label>Oranlar (onaylı ölçümlerden; grup toplamlarının oranı)</label>
              {def.ratios.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
                  <input aria-label="Oran adı" value={r.label} onChange={(e) => upd({ ratios: def.ratios.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={{ flex: "1 1 200px", minWidth: 160 }} />
                  <select aria-label="Pay" value={r.num} onChange={(e) => upd({ ratios: def.ratios.map((x, j) => (j === i ? { ...x, num: e.target.value } : x)) })}>{def.measures.filter((m) => m.key !== "_count").map((m) => <option key={m.key} value={m.key}>{fields.find((f) => f.key === m.key)?.label}</option>)}</select>
                  <span>/</span>
                  <select aria-label="Payda" value={r.den} onChange={(e) => upd({ ratios: def.ratios.map((x, j) => (j === i ? { ...x, den: e.target.value } : x)) })}>{def.measures.filter((m) => m.key !== "_count").map((m) => <option key={m.key} value={m.key}>{fields.find((f) => f.key === m.key)?.label}</option>)}</select>
                  <button type="button" className="btn danger" onClick={() => upd({ ratios: def.ratios.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              {def.measures.filter((m) => m.key !== "_count").length >= 2 && <button type="button" className="btn secondary" onClick={() => { const ms = def.measures.filter((m) => m.key !== "_count"); upd({ ratios: [...def.ratios, { num: ms[0].key, den: ms[1].key, label: "Oran" }] }); }}>+ Oran ekle</button>}
            </div>
            <div className="grid g3" style={{ gap: 10 }}>
              <div style={{ gridColumn: "span 2" }}><label htmlFor="r-d">Açıklama</label><input id="r-d" value={def.description} onChange={(e) => upd({ description: e.target.value })} /></div>
              <div><label htmlFor="r-f">Dipnot</label><input id="r-f" value={def.footnote} onChange={(e) => upd({ footnote: e.target.value })} /></div>
              <label className="check"><input type="checkbox" checked={def.logo} onChange={(e) => upd({ logo: e.target.checked })} /> Logo</label>
              <div style={{ gridColumn: "span 2" }}><label>Bölüm sırası</label><div className="toolbar">{def.sections.map((sx, i) => <span key={sx} className="badge grey" style={{ gap: 6 }}>{sx === "chart" ? "Grafik" : "Tablo"} <button type="button" aria-label="Öne al" onClick={() => upd({ sections: move(def.sections, i, -1) })} style={{ border: 0, background: "none", cursor: "pointer" }}>↑</button><button type="button" aria-label="Kaldır" onClick={() => upd({ sections: def.sections.filter((x) => x !== sx) })} style={{ border: 0, background: "none", cursor: "pointer" }}>×</button></span>)}{(["chart", "table"] as const).filter((x) => !def.sections.includes(x)).map((x) => <button type="button" key={x} className="btn secondary" onClick={() => upd({ sections: [...def.sections, x] })}>+ {x === "chart" ? "Grafik" : "Tablo"}</button>)}</div></div>
            </div>
          </fieldset>
          {errs.length > 0 && <div className="alert bad" style={{ marginTop: 8 }}><span>⚠</span><div>{errs.join(" · ")}</div></div>}
          <div className="sep" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><label htmlFor="r-n">Kayıt adı</label><input id="r-n" value={name} placeholder={def.title} onChange={(e) => { setName(e.target.value); setState({ k: "dirty" }); }} style={{ width: 220 }} /></div>
            <div><label htmlFor="r-sc">Paylaşım</label><select id="r-sc" value={scope} onChange={(e) => { setScope(e.target.value); setState({ k: "dirty" }); }}><option value="PERSONAL">Kişisel</option><option value="TEAM">Ekip</option>{canCorporate && <option value="CORPORATE">Kurumsal</option>}</select></div>
            {!isSnap && <button type="button" className="btn" disabled={pending || !!errs.length} onClick={() => doSave("TEMPLATE")}>Şablon olarak kaydet</button>}
            {!isSnap && <button type="button" className="btn secondary" disabled={pending || !!errs.length} onClick={() => doSave("VIEW")} title="Filtre, kolon ve sıralamayla birlikte">Görünümü kaydet</button>}
            {!isSnap && <button type="button" className="btn secondary" disabled={pending || !!errs.length} onClick={doSnapshot} title="Bu andaki verinin değişmez çıktısı">Sabit nüsha oluştur</button>}
            {current && <button type="button" className="btn secondary" disabled={pending} onClick={() => start(async () => { const r = await copyReport(current.id); setSnapMsg(r); router.refresh(); })}>Kopyasını oluştur</button>}
            {current && !isSnap && <button type="button" className="btn danger" disabled={pending} onClick={() => { if (confirm("Rapor kaldırılsın mı? (denetim kaydında saklanır)")) start(async () => { setSnapMsg(await archiveReport(current.id)); setCurrent(null); router.refresh(); }); }}>Kaldır</button>}
            <span style={{ flex: 1 }} />
            <a className="btn secondary" href={exportHref("xlsx")}>Excel</a>
            <a className="btn secondary" href={exportHref("pdf")}>PDF</a>
          </div>
          {conflict && (
            <div className="alert bad" style={{ marginTop: 8 }}><span>⇄</span><div style={{ width: "100%" }}>
              <b>Çakışma — alan bazında karşılaştırma</b>
              <table style={{ fontSize: 12, marginTop: 4 }}><thead><tr><th>Alan</th><th>Sizin değişikliğiniz</th><th>Sunucudaki (v{conflict.version}, {conflict.by})</th></tr></thead>
                <tbody>{(["title", "dataset", "groupBy", "pivot", "measures", "ratios", "sort", "limit", "description", "footnote"] as (keyof ReportDef)[]).filter((k) => JSON.stringify(def[k]) !== JSON.stringify(conflict.theirs[k])).map((k) => <tr key={k}><td>{k}</td><td><code>{JSON.stringify(def[k])}</code></td><td><code>{JSON.stringify(conflict.theirs[k])}</code></td></tr>)}</tbody></table>
              <div className="toolbar" style={{ marginTop: 6 }}><button type="button" className="btn" onClick={() => { setDef(conflict.theirs); setCurrent((c) => (c ? { ...c, version: conflict.version, def: conflict.theirs } : c)); setConflict(null); setState({ k: "idle" }); }}>Sunucudakini al</button><button type="button" className="btn danger" onClick={() => { setCurrent((c) => (c ? { ...c, version: conflict.version } : c)); doSave(current!.kind as "TEMPLATE"); }}>Benimkini yeni sürüm olarak kaydet</button></div>
              <div className="muted" style={{ fontSize: 11.5 }}>Kritik alanlarda otomatik birleştirme yapılmaz; seçiminiz yeni bir sürüm oluşturur, eski sürüm denetim kaydında kalır.</div>
            </div></div>
          )}
          {snapMsg && <div className={`alert ${snapMsg.ok ? "ok" : "bad"}`} role="status" style={{ marginTop: 8 }}><span>{snapMsg.ok ? "✓" : "⚠"}</span><div>{snapMsg.message}</div></div>}
        </div>
        {out && (
          <div className="card">
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>{def.logo && <img src="/brand/pilotis-logo.png" alt="PILOTIS" style={{ height: 22 }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}<div role="heading" aria-level={2} style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{def.title}</div></div>
            {def.description && <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{def.description}</div>}
            {def.sections.map((sec) => sec === "chart" && def.groupBy && chartField ? (
              <div key="c" style={{ marginBottom: 12 }}><HBars title={chartField.label} series={[{ name: chartField.label }]} total={false} rows={out.rows.slice(0, 25).map((r) => ({ key: String(r._id), label: String(r[out.columns[0].key] ?? "—"), values: [Number(r[chartField.key]) || 0] }))} format={chartField.type === "pct" ? "pct" : chartField.type === "int" || chartField.type === "money" ? "int" : "num"} /></div>
            ) : sec === "table" ? (
              <div key="t" className="tablewrap" style={{ maxHeight: 520, overflow: "auto" }}>
                <table><thead style={{ position: "sticky", top: 0, background: "var(--surface)" }}><tr>{out.columns.map((c) => <th key={c.key} className={c.type !== "text" && c.type !== "id" ? "numcell" : ""}>{c.label}</th>)}</tr></thead>
                  <tbody>{out.rows.map((r, i) => <tr key={String(r._id ?? i)}>{out.columns.map((c) => <td key={c.key} className={c.type !== "text" && c.type !== "id" ? "numcell" : ""}>{fmt(r[c.key], c.type)}</td>)}</tr>)}</tbody>
                  {Object.keys(out.totals).length > 0 && <tfoot><tr style={{ fontWeight: 700, background: "var(--surface-2)" }}>{out.columns.map((c, i) => <td key={c.key} className={i ? "numcell" : ""}>{i === 0 ? "Genel toplam" : fmt(out.totals[c.key], c.type)}</td>)}</tr></tfoot>}
                </table>
              </div>
            ) : null)}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{out.note}{def.footnote ? ` · ${def.footnote}` : ""} · Önizleme ekrandaki filtrelerle; Excel/PDF aynı kapsam ve yetkiyle sunucuda yeniden hesaplanır.</div>
          </div>
        )}
        <ScheduleBox saved={saved.filter((r) => r.kind !== "SNAPSHOT")} schedules={schedules} currentId={current && current.kind !== "SNAPSHOT" ? current.id : null} />
      </section>
    </div>
  );
}

function ScheduleBox({ saved, schedules, currentId }: { saved: Saved[]; schedules: Sched[]; currentId: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<RState>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ reportId: currentId ?? saved[0]?.id ?? "", frequency: "WEEKLY", at: "07:30", weekday: 1, recipients: "", format: "XLSX", dataScope: "Son 7 gün" });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <div className="card">
      <h3>Zamanlanmış raporlar</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Gönderim zamanı, alıcılar, veri kapsamı ve çıktı türü tanımlanır. Gönderim anında her alıcının yetkisi yeniden kontrol edilir; yetkisi olmayan alıcıya gönderilmez.</div>
      {saved.length ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><label htmlFor="z-r">Rapor</label><select id="z-r" value={f.reportId} onChange={(e) => set({ reportId: e.target.value })}>{saved.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div><label htmlFor="z-f">Sıklık</label><select id="z-f" value={f.frequency} onChange={(e) => set({ frequency: e.target.value })}><option value="DAILY">Günlük</option><option value="WEEKLY">Haftalık</option><option value="MONTHLY">Aylık (1'inde)</option></select></div>
          {f.frequency === "WEEKLY" && <div><label htmlFor="z-w">Gün</label><select id="z-w" value={f.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>{["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></div>}
          <div><label htmlFor="z-a">Saat</label><input id="z-a" value={f.at} onChange={(e) => set({ at: e.target.value })} style={{ width: 80 }} /></div>
          <div><label htmlFor="z-k">Veri kapsamı</label><select id="z-k" value={f.dataScope} onChange={(e) => set({ dataScope: e.target.value })}><option>Dün</option><option>Son 7 gün</option><option>Bu ay</option><option>Geçen ay</option></select></div>
          <div><label htmlFor="z-o">Çıktı</label><select id="z-o" value={f.format} onChange={(e) => set({ format: e.target.value })}><option value="XLSX">Excel</option><option value="PDF">PDF</option></select></div>
          <div style={{ flex: 1, minWidth: 260 }}><label htmlFor="z-e">Alıcılar (e-posta|ROL, virgülle)</label><input id="z-e" value={f.recipients} onChange={(e) => set({ recipients: e.target.value })} placeholder="ad@yalovapilotaj.com|BUSINESS_MANAGER" /></div>
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { setMsg(await createSchedule({ ...f, weekday: f.frequency === "WEEKLY" ? f.weekday : null })); router.refresh(); })}>Zamanla</button>
        </div>
      ) : <div className="muted">Önce raporu şablon veya görünüm olarak kaydedin.</div>}
      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`} role="status" style={{ marginTop: 8 }}><span>{msg.ok ? "✓" : "⚠"}</span><div>{msg.message}</div></div>}
      {schedules.length > 0 && <table style={{ marginTop: 10, fontSize: 12.5 }}><thead><tr><th>Rapor</th><th>Zaman</th><th>Kapsam</th><th>Alıcılar</th><th>Son çalışma</th></tr></thead><tbody>{schedules.map((x) => <tr key={x.id}><td>{saved.find((r) => r.id === x.reportId)?.name}</td><td>{{ DAILY: "Günlük", WEEKLY: "Haftalık", MONTHLY: "Aylık" }[x.frequency]} {x.at} · {x.format}</td><td>{x.dataScope}</td><td>{x.recipients}</td><td className="muted">{x.lastResult ?? "Henüz çalışmadı"}</td></tr>)}</tbody></table>}
    </div>
  );
}
