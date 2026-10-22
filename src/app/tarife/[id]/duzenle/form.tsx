"use client";
import { useEffect, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { ActionState } from "@/app/actions";
import { saveDraft } from "../../actions";
import { PriceListEditor } from "./pricelist";
import type { PriceItem, FxTable } from "@/lib/pricing/pricelist";

interface Svc { key: string; label: string; bands: { base: string; perBlock: string | null }[]; cap: number | null; bollard: { fromT: number; toT: number | null; rate: string }[] | null; itemCode: string | null }

export function EditForm({ id, rev, label, groups, adjustments, items, categories, fx }: { id: string; rev: number; label: string; groups: { key: string; label: string; services: Svc[] }[]; adjustments: { code: string; label: string; rate: string; kind: string }[]; items: PriceItem[]; categories: [string, string][]; fx: FxTable }) {
  const [dirty, setDirty] = useState(false);
  const [itemsJson, setItemsJson] = useState(JSON.stringify(items));
  const legacy = groups.some((g) => g.services.some((s) => !s.itemCode));
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  return (
    <ActionForm action={saveDraft as unknown as (s: ActionState, f: FormData) => Promise<ActionState>} hidden={{ id, rev: String(rev) }}>
      <div onInput={() => setDirty(true)}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid g2" style={{ gap: 8 }}>
            <div><label>Etiket</label><input name="label" defaultValue={label} /></div>
            <div><label>Değişiklik gerekçesi</label><input name="reason" placeholder="ör. Bakanlık eki ile karşılaştırma düzeltmesi" /></div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Fiyat listesi</h2>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Her kalemin tekil kodu (000.000), para birimi ve sabit fiyatı ya da formülü vardır. Hizmet atanan kalemler hesap motorunda ücretlendirilir. Operasyonel para birimi TL'dir; döviz kalemler hizmet anındaki TCMB kuruyla TL'ye çevrilir.</div>
          <input type="hidden" name="items" value={itemsJson} />
          <PriceListEditor initial={items} categories={categories} fx={fx} onChange={(j) => { setItemsJson(j); setDirty(true); }} />
        </div>
        {legacy && <div className="grid g2">
          {groups.map((g) => (
            <div className="card" key={g.key}>
              <h2>{g.label}</h2>
              <table><thead><tr><th>Hizmet</th><th>İlk 1000 GT</th><th>+1000 GT</th><th>GT tavanı</th></tr></thead><tbody>
                {g.services.filter((s) => !s.itemCode).map((s) => s.bollard ? (
                  <tr key={s.key}><td>{s.label}</td><td colSpan={3}><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{s.bollard.map((b) => <label key={b.fromT} style={{ fontWeight: 400, width: 92 }}>{b.fromT}–{b.toT ?? "∞"} t<input name={`${g.key}|${s.key}|bp${b.fromT}`} defaultValue={b.rate} inputMode="decimal" /></label>)}</div></td></tr>
                ) : (
                  <tr key={s.key}><td>{s.label}</td>
                    <td><input name={`${g.key}|${s.key}|0|base`} defaultValue={s.bands[0]?.base} inputMode="decimal" style={{ width: 90 }} /></td>
                    <td>{s.bands[0]?.perBlock !== null ? <input name={`${g.key}|${s.key}|0|perBlock`} defaultValue={s.bands[0]?.perBlock ?? ""} inputMode="decimal" style={{ width: 90 }} /> : "—"}</td>
                    <td><input name={`${g.key}|${s.key}|cap`} defaultValue={s.cap ?? ""} inputMode="numeric" style={{ width: 100 }} /></td></tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>}
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Artırım / indirim oranları (0.20 = %20)</h2>
          <div className="grid g3" style={{ gap: 8 }}>{adjustments.map((a) => <div key={a.code}><label>{a.kind === "SURCHARGE" ? "↑" : "↓"} {a.label}</label><input name={`adj|${a.code}`} defaultValue={a.rate} inputMode="decimal" /></div>)}</div>
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <SubmitButton className="btn orange">Doğrula ve kaydet</SubmitButton>
        <span className="muted" style={{ fontSize: 12 }}>{dirty ? "Kaydedilmemiş değişiklikler var" : "Değişiklik yok"} · rev {rev}</span>
      </div>
    </ActionForm>
  );
}
