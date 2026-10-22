"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { verifyDeclaration, setBillingParty, decideBilling, saveCalculation } from "@/app/actions";

export function VerifyForm({ opRef, gt }: { opRef: string; gt: string }) {
  return (
    <ActionForm action={verifyDeclaration} hidden={{ ref: opRef }}>
      <div className="grid g3" style={{ gap: 8 }}>
        <div><label>Gözlenen GT</label><input name="gt" inputMode="decimal" defaultValue={gt} /></div>
        <div><label>Makine / dümen</label><select name="engine" defaultValue="çalışıyor"><option>çalışıyor</option><option>arızalı</option><option>makinesiz</option></select></div>
        <div><label>Not / kanıt</label><input name="note" placeholder="Belge no, fotoğraf ref." /></div>
      </div>
      <div style={{ marginTop: 8 }}><SubmitButton className="btn secondary">Beyanı kontrol et → yeni sürüm</SubmitButton></div>
    </ActionForm>
  );
}

export function BillingPartyForm({ opRef, parties }: { opRef: string; parties: { id: string; label: string }[] }) {
  return (
    <ActionForm action={setBillingParty} hidden={{ ref: opRef }}>
      <label>Fatura muhatabı ata</label>
      <div style={{ display: "flex", gap: 8 }}>
        <select name="billingPartyId" required defaultValue=""><option value="">Seçin…</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <SubmitButton className="btn">Ata</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function BillingDecisionForm({ opRef }: { opRef: string }) {
  return (
    <ActionForm action={decideBilling} hidden={{ ref: opRef }}>
      <div className="grid g2" style={{ gap: 8 }}>
        <div><label>Yetkili kişi</label><input name="authorizedPerson" placeholder="Ad Soyad / unvan" /></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><label className="check"><input type="checkbox" name="taxVerified" /> Vergi kimliği doğrulandı</label></div>
      </div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <SubmitButton className="btn" name="decision" value="APPROVED">Muhatap onayladı</SubmitButton>
        <SubmitButton className="btn danger" name="decision" value="REJECTED">Reddetti</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SaveCalcForm({ opRef }: { opRef: string }) {
  return (
    <ActionForm action={saveCalculation} hidden={{ ref: opRef }}>
      <SubmitButton className="btn">Hesabı kayda al</SubmitButton>
    </ActionForm>
  );
}
