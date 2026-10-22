"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { ActionState } from "@/app/actions";
import { pullTcmb, addManualRate, savePolicy } from "./actions";
type A = (s: ActionState, f: FormData) => Promise<ActionState>;

export function PullForm() {
  return (
    <ActionForm action={pullTcmb as unknown as A}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div><label>Bülten günü (boş = bugün)</label><input type="date" name="date" /></div>
        <SubmitButton className="btn">TCMB'den çek</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ManualForm() {
  return (
    <ActionForm action={addManualRate as unknown as A} resetOnOk>
      <div className="grid g3" style={{ gap: 8 }}>
        <div><label>Döviz</label><select name="currency"><option>USD</option><option>EUR</option></select></div>
        <div><label>Bülten tarihi *</label><input type="date" name="bulletinDate" required /></div>
        <div><label>Kaynak / bülten no *</label><input name="bulletinNo" required placeholder="ör. TCMB 2026/199" /></div>
        <div><label>Döviz alış *</label><input name="forexBuying" required inputMode="decimal" /></div>
        <div><label>Döviz satış *</label><input name="forexSelling" required inputMode="decimal" /></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><SubmitButton className="btn secondary">Elle kaydet</SubmitButton></div>
      </div>
    </ActionForm>
  );
}

export function PolicyForm({ rateType, dateRule }: { rateType: string; dateRule: string }) {
  return (
    <ActionForm action={savePolicy as unknown as A}>
      <div className="grid g2" style={{ gap: 8 }}>
        <div><label>Kur tipi</label><select name="rateType" defaultValue={rateType}><option value="FOREX_SELLING">TCMB döviz satış</option><option value="FOREX_BUYING">TCMB döviz alış</option></select></div>
        <div><label>Kur tarihi kuralı</label><select name="dateRule" defaultValue={dateRule}><option value="PREVIOUS_BULLETIN">Hizmet gününden önceki son bülten</option><option value="SAME_DAY_BULLETIN">Hizmet günü dahil son bülten</option></select></div>
      </div>
      <div className="field" style={{ marginTop: 8 }}><label>Gerekçe / dayanak</label><input name="reason" placeholder="ör. Mali müşavir görüşü tarih/sayı" /></div>
      <SubmitButton className="btn">Politikayı kaydet</SubmitButton>
    </ActionForm>
  );
}
