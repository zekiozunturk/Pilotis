"use client";
import { useMemo, useState } from "react";
import { validatePriceList, evaluateItem, type PriceItem, type FxTable } from "@/lib/pricing/pricelist";
import { VARIABLES } from "@/lib/pricing/formula";

const SERVICES: [string, string][] = [["", "— (bağlı değil)"], ["PILOTAGE", "Kılavuzluk"], ["TOWAGE", "Römorkör"], ["MOORING", "Palamar bağlama"], ["UNMOORING", "Palamar çözme"], ["STANDBY_TUG", "Standby römorkör"]];
const fmt = (v: string, c: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: c, maximumFractionDigits: 4 }).format(Number(v));

function nextCode(items: PriceItem[], group?: string): string {
  const g = group ?? "900";
  const used = items.filter((i) => i.code.startsWith(`${g}.`)).map((i) => Number(i.code.slice(4)));
  return `${g}.${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

export function PriceListEditor({ initial, categories, fx, onChange }: { initial: PriceItem[]; categories: [string, string][]; fx: FxTable; onChange: (json: string) => void }) {
  const [items, setItems] = useState<PriceItem[]>(initial);
  const [sample, setSample] = useState({ GT: "8450", CEKI: "50" });
  const [filter, setFilter] = useState("");
  const issues = useMemo(() => validatePriceList(items), [items]);
  const byCode = (c: string) => issues.filter((i) => i.code === c);
  const update = (idx: number, patch: Partial<PriceItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setItems(next); onChange(JSON.stringify(next));
  };
  const remove = (idx: number) => {
    const code = items[idx].code;
    const users = items.filter((i) => i.formula?.includes(`[${code}]`)).map((i) => i.code);
    if (users.length && !confirm(`[${code}] şu kalemlerin formülünde kullanılıyor: ${users.join(", ")}. Yine de silinsin mi?`)) return;
    const next = items.filter((_, i) => i !== idx); setItems(next); onChange(JSON.stringify(next));
  };
  const add = (afterIdx?: number) => {
    const group = afterIdx !== undefined ? items[afterIdx].code.slice(0, 3) : undefined;
    const row: PriceItem = { code: nextCode(items, group), name: "", unit: "Adet", currency: "TRY", price: "", formula: null };
    const next = afterIdx !== undefined ? [...items.slice(0, afterIdx + 1), row, ...items.slice(afterIdx + 1)] : [...items, row];
    setItems(next); onChange(JSON.stringify(next));
  };
  const vars = { GT: sample.GT ? Number(sample.GT) : null, GT_TAVAN: sample.GT ? Math.min(Number(sample.GT), 120000) : null, BLOK: sample.GT ? Math.max(0, Math.ceil((Math.min(Number(sample.GT), 120000) - 1000) / 1000)) : null, CEKI: sample.CEKI ? Number(sample.CEKI) : null, SAAT: 1, ROMORKOR: 1 };
  const preview = (code: string) => {
    if (byCode(code).length) return null;
    try {
      const r = evaluateItem(items, code, vars, fx);
      const tl = r.currency === "TRY" ? null : fx[r.currency] ? (Number(r.value) * Number(fx[r.currency]!.rate)).toFixed(2) : null;
      return { v: fmt(r.value.toString(), r.currency), tl: tl ? fmt(tl, "TRY") : r.currency === "TRY" ? null : "kur yok" };
    } catch (e) { return { v: "—", tl: (e as Error).message }; }
  };
  const shown = items.map((it, i) => [it, i] as const).filter(([it]) => !filter || `${it.code} ${it.name}`.toLocaleLowerCase("tr").includes(filter.toLocaleLowerCase("tr")));
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ width: 220 }}><label>Ara</label><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="kod veya ad" /></div>
        <div style={{ width: 110 }}><label>Örnek GT</label><input value={sample.GT} onChange={(e) => setSample({ ...sample, GT: e.target.value })} /></div>
        <div style={{ width: 110 }}><label>Örnek çeki (t)</label><input value={sample.CEKI} onChange={(e) => setSample({ ...sample, CEKI: e.target.value })} /></div>
        <button type="button" className="btn secondary" onClick={() => add()}>+ Kalem ekle</button>
        <span className={`badge ${issues.length ? "bad" : "ok"}`}>{issues.length ? `${issues.length} hata` : "Liste geçerli"}</span>
        <span className="muted" style={{ fontSize: 12 }}>{items.length} kalem · USD {fx.USD?.rate ?? "—"} · EUR {fx.EUR?.rate ?? "—"} ({fx.USD?.source ?? "kur yok"})</span>
      </div>
      <div className="tablewrap">
        <table style={{ fontSize: 12.5, minWidth: 1560 }}>
          <thead><tr><th style={{ minWidth: 96 }}>Kod</th><th style={{ minWidth: 300 }}>Kalem</th><th style={{ minWidth: 130 }}>Birim</th><th style={{ minWidth: 80 }}>PB</th><th style={{ minWidth: 96 }}>Fiyat</th><th style={{ minWidth: 300 }}>veya Formül</th><th style={{ minWidth: 150 }}>Hizmet</th><th style={{ minWidth: 170 }}>Kategori</th><th style={{ minWidth: 140 }}>Örnek değer</th><th style={{ minWidth: 76 }} /></tr></thead>
          <tbody>
            {shown.map(([it, i]) => {
              const errs = byCode(it.code); const pv = preview(it.code);
              return (
                <tr key={i} style={errs.length ? { background: "var(--bad-bg)" } : undefined}>
                  <td><input className="mono" value={it.code} onChange={(e) => update(i, { code: e.target.value })} style={{ padding: "4px 6px" }} /></td>
                  <td><input value={it.name} onChange={(e) => update(i, { name: e.target.value })} style={{ padding: "4px 6px" }} />
                    {errs.map((e, k) => <div key={k} style={{ color: "var(--bad)", fontSize: 11.5 }}>⚠ {e.message}</div>)}</td>
                  <td><input value={it.unit} onChange={(e) => update(i, { unit: e.target.value })} style={{ padding: "4px 6px" }} /></td>
                  <td><select value={it.currency} onChange={(e) => update(i, { currency: e.target.value as PriceItem["currency"] })} style={{ padding: "4px 4px" }}><option>TRY</option><option>USD</option><option>EUR</option></select></td>
                  <td><input className="mono" value={it.price ?? ""} onChange={(e) => update(i, { price: e.target.value, ...(e.target.value ? { formula: null } : {}) })} disabled={!!it.formula?.trim()} inputMode="decimal" style={{ padding: "4px 6px" }} /></td>
                  <td><input className="mono" value={it.formula ?? ""} onChange={(e) => update(i, { formula: e.target.value, ...(e.target.value ? { price: null } : {}) })} placeholder="ör. [200.001] * %30" style={{ padding: "4px 6px" }} /></td>
                  <td><select value={it.serviceKind ?? ""} onChange={(e) => update(i, { serviceKind: e.target.value || null })} style={{ padding: "4px 4px" }}>{SERVICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td><select value={it.category ?? ""} onChange={(e) => update(i, { category: e.target.value || null })} disabled={!it.serviceKind} style={{ padding: "4px 4px" }}><option value="">Tüm kategoriler</option>{categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td>{pv && <><div className="mono"><b>{pv.v}</b></div>{pv.tl && <div className="muted" style={{ fontSize: 11 }}>{pv.tl}</div>}</>}</td>
                  <td style={{ whiteSpace: "nowrap" }}><button type="button" className="btn secondary" style={{ minHeight: 26, padding: "2px 7px" }} title="Altına kalem ekle" onClick={() => add(i)}>+</button> <button type="button" className="btn danger" style={{ minHeight: 26, padding: "2px 7px" }} title="Sil" onClick={() => remove(i)}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Formül yardımı</summary>
        <div className="grid g2" style={{ gap: 12, marginTop: 8, fontSize: 12.5 }}>
          <div>
            <b>Örnekler</b>
            <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
              <li><span className="mono">[200.001] * %30</span> — 200.001 kaleminin %30'u</li>
              <li><span className="mono">[240.001] + BLOK * [240.002]</span> — ilk 1000 GT + her ilave 1000 GT</li>
              <li><span className="mono">MAX([900.001]; 5000)</span> — en az 5.000</li>
              <li><span className="mono">EGER(GT &gt; 50000; [240.010] * 120%; [240.010])</span></li>
              <li><span className="mono">KADEME(CEKI; 16; [500.001]; 30; [500.002])</span> — eşiğe göre</li>
              <li><span className="mono">YUVARLA([200.001] * 1.1; 2)</span></li>
            </ul>
            <div className="muted">Ondalık ayırıcı nokta (12.5); argüman ayırıcı noktalı virgül (;). Başka para birimindeki kaleme başvuru, bu kalemin para birimine güncel kurla çevrilir.</div>
          </div>
          <div>
            <b>Değişkenler</b>
            <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{Object.entries(VARIABLES).map(([k, v]) => <li key={k}><span className="mono">{k}</span> — {v}</li>)}</ul>
            <b>Fonksiyonlar</b>: MIN, MAX, YUVARLA, YUKARIYUVARLA, ASAGIYUVARLA, MUTLAK, EGER, KADEME
          </div>
        </div>
      </details>
    </div>
  );
}
