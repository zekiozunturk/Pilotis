"use client";
import { useActionState } from "react";
import { updateFirm, type FirmState } from "./actions";
import { submitWith } from "@/components/ActionForm";
type P = { address: string | null; city: string | null; phone: string | null; email: string | null; taxOffice: string | null; website: string | null };
export function FirmForm({ p }: { p: P }) {
  const [st, action, pending] = useActionState<FirmState, FormData>(updateFirm, null);
  return (
    <form onSubmit={submitWith(action)} className="grid2">
      <label>Vergi dairesi<input name="taxOffice" defaultValue={p.taxOffice ?? ""} /></label>
      <label>Şehir<input name="city" defaultValue={p.city ?? ""} /></label>
      <label style={{ gridColumn: "1/-1" }}>Fatura adresi<input name="address" defaultValue={p.address ?? ""} /></label>
      <label>Telefon<input name="phone" defaultValue={p.phone ?? ""} inputMode="tel" /></label>
      <label>E-posta (fatura/bildirim)<input name="email" type="email" defaultValue={p.email ?? ""} /></label>
      <label>Web<input name="website" defaultValue={p.website ?? ""} /></label>
      <div className="toolbar" style={{ gridColumn: "1/-1" }}><button className="btn orange" disabled={pending}>Kaydet</button>{st && <span role="status" className={`badge ${st.ok ? "ok" : "bad"}`}>{st.message}</span>}</div>
    </form>
  );
}
