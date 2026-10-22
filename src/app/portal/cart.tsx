"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { removeCartItem, setItemBilling, submitCart } from "./actions";
import type { ActionState } from "@/app/actions";

type A = (s: ActionState, f: FormData) => Promise<ActionState>;

export function CartItemControls({ itemId, billingPartyId, parties, hidden }: { itemId: string; billingPartyId: string | null; parties: { id: string; label: string }[]; hidden: Record<string, string> }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <ActionForm action={setItemBilling as A} hidden={{ ...hidden, itemId }}>
        <div style={{ display: "flex", gap: 6 }}>
          <select name="billingPartyId" defaultValue={billingPartyId ?? ""} style={{ minWidth: 200 }}><option value="">Henüz belirlenmedi</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          <SubmitButton className="btn secondary">Kaydet</SubmitButton>
        </div>
      </ActionForm>
      <ActionForm action={removeCartItem as A} hidden={{ ...hidden, itemId }}><SubmitButton className="btn danger">Çıkar</SubmitButton></ActionForm>
    </div>
  );
}

export function SubmitCartForm({ hidden, count, signer, blocked }: { hidden: Record<string, string>; count: number; signer?: { name: string; title: string }; blocked?: string | null }) {
  return (
    <ActionForm action={submitCart as A} hidden={hidden}>
      <fieldset className="sign">
        <legend>Beyanname onayı</legend>
        <p className="small">Sepetteki her talep için girdiğiniz gemi ve yük bilgileri <a href="/portal/belgeler#BEYAN_TAAHHUDU" target="_blank">Gemi ve Yük Beyannamesi Taahhüdü</a> ile birlikte kaydedilir. Onayınız ad, unvan, zaman ve metin özetiyle saklanır.</p>
        <div className="grid g2" style={{ gap: 8 }}>
          <div className="field"><label>Beyan eden — ad soyad *</label><input name="signerName" defaultValue={signer?.name ?? ""} required minLength={3} /></div>
          <div className="field"><label>Unvan</label><input name="signerTitle" defaultValue={signer?.title ?? ""} /></div>
        </div>
        <label className="check"><input type="checkbox" name="declAccept" required /> Beyan ettiğim gemi, yük ve arıza bilgilerinin doğru olduğunu; beyana aykırılık halinde hizmetin durdurulabileceğini ve yeniden fiyatlandırılabileceğini kabul ediyorum.</label>
      </fieldset>
      {blocked && <div className="alert warn" style={{ margin: "8px 0" }}><span>⚠</span><div>{blocked} <a href="/portal/belgeler">Sözleşme ve onaylar →</a></div></div>}
      <SubmitButton className="btn orange">{count} talebi Yalova Pilotaj'a gönder</SubmitButton>
    </ActionForm>
  );
}
