"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { createVessel, type ActionState } from "@/app/actions";

export function VesselForm() {
  return (
    <ActionForm action={createVessel as (s: ActionState, f: FormData) => Promise<ActionState>} resetOnOk>
      <div className="field"><label>Gemi adı *</label><input name="name" required /></div>
      <div className="grid g2" style={{ gap: 8 }}>
        <div className="field"><label>IMO</label><input name="imo" inputMode="numeric" maxLength={7} /></div>
        <div className="field"><label>Bayrak</label><input name="flag" maxLength={3} placeholder="TR" /></div>
      </div>
      <div className="field"><label>Gemi tipi</label><input name="vesselType" /></div>
      <div className="grid g3" style={{ gap: 8 }}>
        <div className="field"><label>GT</label><input name="gt" inputMode="decimal" /></div>
        <div className="field"><label>DWT</label><input name="dwt" inputMode="decimal" /></div>
        <div className="field"><label>LOA (m)</label><input name="loa" inputMode="decimal" /></div>
      </div>
      <SubmitButton>Doğrula ve kaydet</SubmitButton>
    </ActionForm>
  );
}
