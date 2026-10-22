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

export function SubmitCartForm({ hidden, count }: { hidden: Record<string, string>; count: number }) {
  return (
    <ActionForm action={submitCart as A} hidden={hidden}>
      <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" required /> Beyan ettiğim gemi, yük ve arıza bilgilerinin doğru olduğunu; beyana aykırılık halinde hizmetin durdurulabileceğini ve yeniden fiyatlandırılabileceğini kabul ediyorum.</label>
      <SubmitButton className="btn orange">{count} talebi gönder</SubmitButton>
    </ActionForm>
  );
}
