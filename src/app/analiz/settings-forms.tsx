"use client";
import { useActionState } from "react";
import { saveAlertCfg, saveAllocation, type AState } from "./actions";
import { submitWith } from "@/components/ActionForm";

export function AlertCfgForm({ cfg, labels, canEdit }: { cfg: Record<string, number>; labels: Record<string, string>; canEdit: boolean }) {
  const [st, act, pending] = useActionState<AState, FormData>(saveAlertCfg, null);
  return (
    <form onSubmit={submitWith(act)}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
        {Object.entries(cfg).map(([k, v]) => <div key={k}><label htmlFor={`a-${k}`}>{labels[k] ?? k}</label><input id={`a-${k}`} name={k} defaultValue={String(v)} inputMode="decimal" disabled={!canEdit} /></div>)}
      </div>
      {canEdit && <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}><div style={{ flex: 1 }}><label htmlFor="a-reason">Değişiklik gerekçesi *</label><input id="a-reason" name="reason" placeholder="ör. Kış dönemi gece görevi sınırı" /></div><button className="btn" disabled={pending}>{pending ? "Kaydediliyor…" : "Eşikleri kaydet"}</button></div>}
      {!canEdit && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Eşikleri yalnız yöneticiler değiştirebilir.</div>}
      {st && <div className={`alert ${st.ok ? "ok" : "bad"}`} role="status" style={{ marginTop: 8 }}><span>{st.ok ? "✓" : "⚠"}</span><div>{st.message}</div></div>}
    </form>
  );
}

export function AllocationForm({ method, weights, version, approvedBy, note, canEdit }: { method: string; weights: Record<string, number>; version: number; approvedBy: string; note: string; canEdit: boolean }) {
  const [st, act, pending] = useActionState<AState, FormData>(saveAllocation, null);
  const L: Record<string, string> = { KAPTAN: "Kaptan", BASCARKCI: "Başçarkçı", YAGCI: "Yağcı", PIMCI: "Pimci", KILAVUZ: "Kılavuz kaptan" };
  return (
    <form onSubmit={submitWith(act)}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Geçerli: sürüm {version} · {method === "WEIGHTS" ? "ağırlıklı süre" : "hizmet süresi"} · onaylayan {approvedBy} · {note}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><label htmlFor="al-m">Personel dağıtım yöntemi</label><select id="al-m" name="method" defaultValue={method} disabled={!canEdit}><option value="DURATION">Gerçek hizmet süresine göre</option><option value="WEIGHTS">Onaylı rol ağırlıkları × süre</option></select></div>
        {Object.entries(weights).map(([k, v]) => <div key={k} style={{ width: 110 }}><label htmlFor={`w-${k}`}>{L[k] ?? k}</label><input id={`w-${k}`} name={`w_${k}`} defaultValue={String(v)} inputMode="decimal" disabled={!canEdit} /></div>)}
      </div>
      {canEdit && <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}><div style={{ flex: 1 }}><label htmlFor="al-n">Gerekçe *</label><input id="al-n" name="note" placeholder="ör. Yönetim kurulu kararı 2026/14" /></div><button className="btn" disabled={pending}>{pending ? "Kaydediliyor…" : "Yeni sürüm olarak kaydet"}</button></div>}
      {st && <div className={`alert ${st.ok ? "ok" : "bad"}`} role="status" style={{ marginTop: 8 }}><span>{st.ok ? "✓" : "⚠"}</span><div>{st.message}</div></div>}
    </form>
  );
}
