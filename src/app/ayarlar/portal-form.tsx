"use client";
import { useActionState } from "react";
import { saveLeadHours, type LeadState } from "./portal-actions";
import { submitWith } from "@/components/ActionForm";
export function LeadForm({ hours, canEdit }: { hours: number; canEdit: boolean }) {
  const [st, action, pending] = useActionState<LeadState, FormData>(saveLeadHours, null);
  return (
    <form onSubmit={submitWith(action)} className="grid" style={{ gap: 8 }}>
      <label>Müşteri talebinde asgari bildirim süresi (saat)<input name="hours" type="number" min={0} max={72} step={0.5} defaultValue={hours} disabled={!canEdit} /></label>
      <label>Gerekçe<input name="reason" placeholder="ör. R-011 doğrulandı" disabled={!canEdit} /></label>
      {canEdit && <div className="toolbar"><button className="btn" disabled={pending}>Kaydet</button>{st && <span role="status" className={`badge ${st.ok ? "ok" : "bad"}`}>{st.message}</span>}</div>}
      <p className="muted small">Portalda bu süreden yakın tarih seçilemez ve sunucu talebi reddeder; personel “masa” talebinde yalnız uyarı görür. Acil işler telefonla alınır.</p>
    </form>
  );
}
