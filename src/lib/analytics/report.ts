/**
 * Rapor tasarımcısı motoru (saf) — tarayıcıda canlı önizleme ve sunucuda sabit nüsha aynı kodla hesaplanır.
 * Ölçüm tanımları analiz tablolarından gelir (ölçüm sözlüğü); tasarımcı gelir/saat/tahsilat tanımlarını değiştiremez.
 */
export type FieldType = "text" | "id" | "int" | "number" | "money" | "hours" | "pct" | "datetime" | "date";
export interface Field { key: string; label: string; type: FieldType; note?: string }
export type DatasetKey = "ops" | "persons" | "assets";
export type Agg = "sum" | "avg" | "count" | "min" | "max";
export const AGG_LABEL: Record<Agg, string> = { sum: "Toplam", avg: "Ortalama", count: "Adet", min: "En küçük", max: "En büyük" };
export const DATASET_LABEL: Record<DatasetKey, string> = { ops: "İş emirleri (operasyon)", persons: "Personel", assets: "Araçlar" };

export interface ReportDef {
  v: 1; title: string; description: string; footnote: string; logo: boolean;
  dataset: DatasetKey; groupBy: string | null; pivot: string | null;
  measures: { key: string; agg: Agg }[];
  ratios: { num: string; den: string; label: string }[];
  sort: { col: string; dir: "asc" | "desc" } | null; limit: number | null;
  sections: ("chart" | "table")[];
}
export const EMPTY_DEF: ReportDef = { v: 1, title: "Yeni rapor", description: "", footnote: "", logo: true, dataset: "ops", groupBy: "type", pivot: null, measures: [{ key: "_count", agg: "count" }], ratios: [], sort: null, limit: null, sections: ["chart", "table"] };

export interface ReportOut { columns: Field[]; rows: Record<string, unknown>[]; totals: Record<string, number | null>; note: string }

const isNum = (t: FieldType) => ["int", "number", "money", "hours", "pct"].includes(t);
export const dimsOf = (fields: Field[]) => fields.filter((f) => !isNum(f.type) && f.type !== "datetime");
export const measuresOf = (fields: Field[]) => fields.filter((f) => isNum(f.type) && f.type !== "pct");

function agg(vals: number[], a: Agg): number | null {
  if (a === "count") return vals.length;
  const xs = vals.filter((v) => Number.isFinite(v));
  if (!xs.length) return null;
  if (a === "sum") return xs.reduce((s, v) => s + v, 0);
  if (a === "avg") return xs.reduce((s, v) => s + v, 0) / xs.length;
  if (a === "min") return Math.min(...xs);
  return Math.max(...xs);
}
const mKey = (m: { key: string; agg: Agg }) => `${m.agg}:${m.key}`;

export function validateDef(def: ReportDef, fields: Field[]): string[] {
  const errs: string[] = [];
  const keys = new Set(fields.map((f) => f.key));
  if (!def.title.trim()) errs.push("Başlık zorunlu");
  if (def.groupBy && !keys.has(def.groupBy)) errs.push(`Gruplama alanı bulunamadı: ${def.groupBy}`);
  if (def.pivot && (!def.groupBy || !keys.has(def.pivot))) errs.push("Pivot için önce gruplama seçilmeli");
  for (const m of def.measures) if (m.key !== "_count" && !keys.has(m.key)) errs.push(`Ölçüm bulunamadı: ${m.key}`);
  for (const r of def.ratios) if (!def.measures.some((m) => m.key === r.num) || !def.measures.some((m) => m.key === r.den)) errs.push(`Oran yalnız seçili ölçümlerden kurulabilir: ${r.label}`);
  if (!def.measures.length) errs.push("En az bir ölçüm seçin");
  return errs;
}

export function runReport(def: ReportDef, rows: Record<string, unknown>[], fields: Field[]): ReportOut {
  const F = new Map(fields.map((f) => [f.key, f]));
  const label = (m: { key: string; agg: Agg }) => (m.key === "_count" ? "Kayıt sayısı" : `${F.get(m.key)?.label ?? m.key}${m.agg === "sum" ? "" : ` (${AGG_LABEL[m.agg].toLowerCase()})`}`);
  const typeOf = (m: { key: string; agg: Agg }): FieldType => (m.agg === "count" ? "int" : m.agg === "avg" && F.get(m.key)?.type === "int" ? "number" : F.get(m.key)?.type ?? "number");
  // Boş hücre sıfır sayılmaz (eksik veri ≠ 0)
  const vals = (rs: Record<string, unknown>[], k: string) => rs.map((r) => r[k]).filter((v) => v != null && v !== "").map(Number).filter((v) => Number.isFinite(v));

  // Detay modu: gruplama yoksa satırlar aynen (seçili ölçüm kolonlarıyla)
  if (!def.groupBy) {
    const idField = dimsOf(fields)[0];
    const cols: Field[] = [idField, ...def.measures.filter((m) => m.key !== "_count").map((m) => ({ key: m.key, label: F.get(m.key)?.label ?? m.key, type: F.get(m.key)?.type ?? "number" } as Field))];
    let out = rows.map((r) => Object.fromEntries([["_id", r._id], ...cols.map((c) => [c.key, r[c.key]])]));
    out = sortRows(out, def.sort);
    if (def.limit) out = out.slice(0, def.limit);
    const totals: Record<string, number | null> = {};
    for (const c of cols.slice(1)) totals[c.key] = agg(vals(out, c.key), "sum");
    return { columns: cols, rows: out, totals, note: "Detay görünümü" };
  }
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) { const k = String(r[def.groupBy] || "—"); const l = groups.get(k); if (l) l.push(r); else groups.set(k, [r]); }
  const pivotVals = def.pivot ? [...new Set(rows.map((r) => String(r[def.pivot!] ?? "—")))].sort((a, b) => a.localeCompare(b, "tr", { numeric: true })).slice(0, 24) : [];
  const g = F.get(def.groupBy)!;
  const columns: Field[] = [{ key: def.groupBy, label: g?.label ?? def.groupBy, type: "text" }];
  for (const m of def.measures) columns.push({ key: mKey(m), label: label(m), type: typeOf(m) });
  for (const r of def.ratios) columns.push({ key: `ratio:${r.num}/${r.den}`, label: r.label || `${F.get(r.num)?.label} / ${F.get(r.den)?.label}`, type: "pct" });
  if (def.pivot) { const m0 = def.measures[0]; for (const p of pivotVals) columns.push({ key: `pv:${p}`, label: `${p} · ${label(m0)}`, type: typeOf(m0) }); }
  let out = [...groups].map(([k, rs]) => {
    const row: Record<string, unknown> = { _id: k, [def.groupBy!]: k };
    for (const m of def.measures) row[mKey(m)] = m.key === "_count" ? rs.length : agg(vals(rs, m.key), m.agg);
    for (const r of def.ratios) { const n = agg(vals(rs, r.num), "sum"), d = agg(vals(rs, r.den), "sum"); row[`ratio:${r.num}/${r.den}`] = n != null && d ? n / d : null; }
    if (def.pivot) { const m0 = def.measures[0]; for (const p of pivotVals) { const sub = rs.filter((x) => String(x[def.pivot!] ?? "—") === p); row[`pv:${p}`] = sub.length ? (m0.key === "_count" ? sub.length : agg(vals(sub, m0.key), m0.agg)) : null; } }
    return row;
  });
  out = sortRows(out, def.sort ?? { col: columns[1]?.key ?? def.groupBy, dir: "desc" });
  if (def.limit) out = out.slice(0, def.limit);
  // Toplamlar: kaynak satırlardan yeniden (ortalama = genel ortalama, oran = toplamların oranı)
  const totals: Record<string, number | null> = {};
  const used = def.limit ? out.flatMap((r) => groups.get(String(r._id)) ?? []) : rows;
  for (const m of def.measures) totals[mKey(m)] = m.key === "_count" ? used.length : agg(vals(used, m.key), m.agg);
  for (const r of def.ratios) { const n = agg(vals(used, r.num), "sum"), d = agg(vals(used, r.den), "sum"); totals[`ratio:${r.num}/${r.den}`] = n != null && d ? n / d : null; }
  if (def.pivot) for (const p of pivotVals) totals[`pv:${p}`] = out.reduce((s, r) => s + (Number(r[`pv:${p}`]) || 0), 0);
  return { columns, rows: out, totals, note: `${groups.size} grup${def.limit && groups.size > def.limit ? ` (ilk ${def.limit})` : ""} · oranlar grup toplamlarının oranıdır` };
}
function sortRows(rows: Record<string, unknown>[], s: ReportDef["sort"]) {
  if (!s) return rows;
  return [...rows].sort((a, b) => {
    const x = a[s.col], y = b[s.col];
    const c = typeof x === "number" || typeof y === "number" ? (Number(x ?? -Infinity) - Number(y ?? -Infinity)) : String(x ?? "").localeCompare(String(y ?? ""), "tr", { numeric: true });
    return s.dir === "asc" ? c : -c;
  });
}

/** Hazır raporlar — tanımlar aynı ölçüm sözlüğünü kullanır; bazıları ilgili analiz ekranına yönlendirir */
export const READY_REPORTS: { key: string; title: string; def?: Partial<ReportDef>; href?: string; finance?: boolean }[] = [
  { key: "gunluk", title: "Günlük operasyon özeti", def: { title: "Günlük operasyon özeti", dataset: "ops", groupBy: "day", measures: [{ key: "_count", agg: "count" }, { key: "active", agg: "sum" }, { key: "waiting", agg: "sum" }], sort: { col: "day", dir: "asc" } } },
  { key: "acik", title: "Açık ve geciken iş emirleri", href: "/analiz/plan?durum=READY,STARTED,PARTIAL" },
  { key: "personel", title: "Personel çalışma ve fazla mesai", def: { title: "Personel çalışma ve fazla mesai", dataset: "persons", groupBy: "team", measures: [{ key: "planned", agg: "sum" }, { key: "actual", agg: "sum" }, { key: "overtime", agg: "sum" }, { key: "night", agg: "sum" }], ratios: [{ num: "overtime", den: "actual", label: "Fazla mesai oranı" }] } },
  { key: "romorkor", title: "Römorkör kullanım dağılımı", def: { title: "Römorkör kullanım dağılımı", dataset: "assets", groupBy: "name", measures: [{ key: "available", agg: "sum" }, { key: "active", agg: "sum" }, { key: "transit", agg: "sum" }, { key: "waiting", agg: "sum" }, { key: "down", agg: "sum" }], ratios: [{ num: "active", den: "available", label: "Aktif hizmet / kullanılabilir" }] } },
  { key: "ekipfin", title: "Ekip/vardiya finansal özeti", finance: true, def: { title: "Ekip finansal özeti", dataset: "persons", groupBy: "team", measures: [{ key: "allocated", agg: "sum" }, { key: "actual", agg: "sum" }], description: "Dağıtılmış analitik gelir; ücret/prim değildir." } },
  { key: "faturasiz", title: "Faturalanmamış işler", finance: true, href: "/analiz/finans?muhasebe=AWAITING_EXPORT&durum=COMPLETED#faturalanmamis" },
  { key: "mutabakat", title: "Tahakkuk–fatura mutabakatı", finance: true, def: { title: "Tahakkuk–fatura mutabakatı", dataset: "ops", groupBy: "party", measures: [{ key: "accrual", agg: "sum" }, { key: "invoiced", agg: "sum" }, { key: "credit", agg: "sum" }, { key: "net", agg: "sum" }], ratios: [{ num: "net", den: "accrual", label: "Net fatura / tahakkuk" }] } },
  { key: "musteri", title: "Müşteri ve tersane analizi", finance: true, def: { title: "Müşteri ve tersane analizi", dataset: "ops", groupBy: "party", pivot: "type", measures: [{ key: "_count", agg: "count" }, { key: "net", agg: "sum" }, { key: "open", agg: "sum" }] } },
  { key: "bekleme", title: "Bekleme ve iptal nedenleri", href: "/analiz/bekleme" },
  { key: "bakim", title: "Bakım ve belge geçerlilikleri", href: "/analiz/romorkor" },
  { key: "dinlenme", title: "İş yükü ve dinlenme uygunluğu", def: { title: "İş yükü ve dinlenme uygunluğu", dataset: "persons", groupBy: "role", measures: [{ key: "actual", agg: "avg" }, { key: "viol", agg: "sum" }, { key: "minRest24", agg: "min" }, { key: "night", agg: "avg" }] } },
  { key: "tarife", title: "Tarife değişiklik karşılaştırması", href: "/tarife/karsilastir" },
  { key: "bildirim", title: "Resmî bildirim takip raporu", def: { title: "Resmî bildirim takip raporu", dataset: "ops", groupBy: "notify", pivot: "status", measures: [{ key: "_count", agg: "count" }] } },
];
