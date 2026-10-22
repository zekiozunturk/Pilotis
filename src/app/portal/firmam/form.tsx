"use client";
import { useActionState } from "react";
import { updateFirm, inviteUser, type FirmState, type InviteState } from "./actions";
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

export function InviteForm() {
  const [st, action, pending] = useActionState<InviteState, FormData>(inviteUser, null);
  return (
    <form onSubmit={submitWith(action)} className="grid2">
      <label>Ad soyad *<input name="name" required /></label>
      <label>Unvan<input name="title" /></label>
      <label>İş e-postası *<input name="email" type="email" required /></label>
      <label>Kullanıcı adı *<input name="username" required autoCapitalize="none" /></label>
      <label>Cep telefonu<input name="phone" inputMode="tel" /></label>
      <div style={{ display: "grid", gap: 4, alignSelf: "end" }}>
        <label className="check"><input type="checkbox" name="billing" defaultChecked /> Fatura muhatabı onayı verebilir</label>
        <label className="check"><input type="checkbox" name="admin" /> Firma yetkilisi (kullanıcı ekleyebilir)</label>
      </div>
      <div className="toolbar" style={{ gridColumn: "1/-1" }}>
        <button className="btn orange" disabled={pending}>Kullanıcıyı davet et</button>
        {st && <span role="status" className={`badge ${st.ok ? "ok" : "bad"}`}>{st.message}</span>}
      </div>
      {st?.link && <div className="alert info" style={{ gridColumn: "1/-1" }}><span>ⓘ</span><div><b>Sunum modu</b>E-posta altyapısı tanımlı olmadığı için etkinleştirme bağlantısı burada gösteriliyor: <a href={st.link} className="mono small" style={{ wordBreak: "break-all" }}>{st.link}</a></div></div>}
      <p className="muted small" style={{ gridColumn: "1/-1" }}>Şifre e-postayla gönderilmez; davet edilen kişi bağlantıdan kendi şifresini belirler (72 saat geçerli).</p>
    </form>
  );
}
