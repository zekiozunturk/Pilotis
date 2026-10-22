import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage } from "@/lib/session";
import { loadVersion } from "@/lib/tariff/repo";
import { diffDefinitions, compareMatrix } from "@/lib/tariff/admin";
import { STATUS_LABELS } from "@/data/catalog";

export const metadata = { title: "Tarife karşılaştırma" };
const pctTone = (p: string | null) => (p === null ? "" : Number(p) > 0 ? "var(--bad)" : Number(p) < 0 ? "var(--ok)" : "var(--muted)");

export default async function Compare({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  await requireInternalPage();
  const sp = await searchParams;
  const all = await db.select({ id: s.tariffVersions.id, label: s.tariffVersions.label, status: s.tariffVersions.status }).from(s.tariffVersions).orderBy(asc(s.tariffVersions.validFrom));
  const A = sp.a ? await loadVersion(sp.a) : null;
  const B = sp.b ? await loadVersion(sp.b) : null;
  const diff = A && B ? diffDefinitions(A.input.definition, B.input.definition) : [];
  return (
    <>
      <div className="pagehead"><div><h1>Tarife sürüm karşılaştırması</h1><div className="muted">Hücre bazında değişiklik ve örnek GT'lerde esas tutar etkisi (artırım/indirimsiz).</div></div></div>
      <form className="card" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}><label>Önceki (A)</label><select name="a" defaultValue={sp.a}>{all.map((v) => <option key={v.id} value={v.id}>{v.label} · {STATUS_LABELS[v.status]}</option>)}</select></div>
        <div style={{ flex: 1, minWidth: 240 }}><label>Yeni (B)</label><select name="b" defaultValue={sp.b}>{all.map((v) => <option key={v.id} value={v.id}>{v.label} · {STATUS_LABELS[v.status]}</option>)}</select></div>
        <button className="btn">Karşılaştır</button>
      </form>
      {A && B && <>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Değişen hücreler ({diff.length})</h2>
          <table><thead><tr><th>Hücre</th><th>A</th><th>B</th><th>Değişim</th></tr></thead><tbody>
            {diff.map((d) => <tr key={d.path}><td>{d.label}</td><td className="mono">{d.from ?? "—"}</td><td className="mono">{d.to ?? "—"}</td><td style={{ color: pctTone(d.changePct), fontWeight: 600 }}>{d.changePct !== null ? `${Number(d.changePct) > 0 ? "+" : ""}${d.changePct}%` : "yeni/kaldırıldı"}</td></tr>)}
            {diff.length === 0 && <tr><td colSpan={4} className="muted">Fark yok.</td></tr>}
          </tbody></table>
        </div>
        {(["PILOTAGE", "TOWAGE", "MOORING"] as const).map((k) => (
          <div className="card" key={k} style={{ marginBottom: 16 }}>
            <h2>{k === "PILOTAGE" ? "Kılavuzluk" : k === "TOWAGE" ? "Römorkör (1 adet)" : "Palamar"} — esas tutar ({B.row.currency})</h2>
            <div className="tablewrap" style={{ border: 0 }}>
              <table><thead><tr><th>Kategori</th>{compareMatrix(A.input, B.input, k)[0]?.rows.map((r) => <th key={r.gt}>{r.gt.toLocaleString("tr-TR")} GT</th>)}</tr></thead>
                <tbody>{compareMatrix(A.input, B.input, k).map((c) => <tr key={c.category}><td><b>{c.label}</b></td>{c.rows.map((r) => <td key={r.gt} style={{ fontSize: 12 }}>{r.a ?? "—"} → <b>{r.b ?? "—"}</b>{r.pct !== null && <div style={{ color: pctTone(r.pct) }}>{Number(r.pct) > 0 ? "+" : ""}{r.pct}%</div>}</td>)}</tr>)}</tbody></table>
            </div>
          </div>
        ))}
        <div className="toolbar"><Link className="btn secondary" href={`/tarife/${A.row.id}`}>A sürümü</Link><Link className="btn secondary" href={`/tarife/${B.row.id}`}>B sürümü</Link></div>
      </>}
    </>
  );
}
