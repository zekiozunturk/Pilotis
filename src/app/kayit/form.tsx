"use client";
import { useActionState } from "react";
import { register, type RegState } from "./actions";
import { submitWith } from "@/components/ActionForm";

export function RegisterForm({ texts }: { texts: { code: string; title: string; node: React.ReactNode }[] }) {
  const [st, action, pending] = useActionState<RegState, FormData>(register, null);
  const v = st?.values ?? {};
  const inv = (f: string) => (st?.field === f ? { "aria-invalid": true as const } : {});
  const text = (c: string) => texts.find((x) => x.code === c);
  return (
    <form onSubmit={submitWith(action)} className="reg" noValidate>
      <fieldset><legend>1 · Firma (cari) bilgileri</legend>
        <div className="grid2">
          <label style={{ gridColumn: "1/-1" }}>Firma unvanı *<input name="legalName" defaultValue={v.legalName} required {...inv("legalName")} /></label>
          <label>Firma türü<select name="kind" defaultValue={v.kind ?? "AGENT"}><option value="AGENT">Acente</option><option value="OWNER">Armatör / gemi sahibi</option><option value="OPERATOR_MANAGER">Gemi işletmecisi</option><option value="SHIPYARD">Tersane</option><option value="CHARTERER">Kiracı</option></select></label>
          <label>Vergi no (10 hane) *<input name="taxNumber" inputMode="numeric" maxLength={10} defaultValue={v.taxNumber} required {...inv("taxNumber")} /></label>
          <label>Vergi dairesi *<input name="taxOffice" defaultValue={v.taxOffice} required {...inv("taxOffice")} /></label>
          <label>Şehir<input name="city" defaultValue={v.city} /></label>
          <label style={{ gridColumn: "1/-1" }}>Fatura adresi *<input name="address" defaultValue={v.address} required {...inv("address")} /></label>
          <label>Telefon<input name="phone" inputMode="tel" defaultValue={v.phone} /></label>
          <label>Ülke (ISO 2)<input name="country" maxLength={2} defaultValue={v.country ?? "TR"} /></label>
        </div>
      </fieldset>
      <fieldset><legend>2 · Yetkili kullanıcı</legend>
        <div className="grid2">
          <label>Ad soyad *<input name="name" defaultValue={v.name} required autoComplete="name" {...inv("name")} /></label>
          <label>Unvan<input name="title" defaultValue={v.title} autoComplete="organization-title" /></label>
          <label>İş e-postası *<input name="email" type="email" defaultValue={v.email} required autoComplete="email" {...inv("email")} /></label>
          <label>Kullanıcı adı *<input name="username" defaultValue={v.username} required autoComplete="username" autoCapitalize="none" {...inv("username")} /></label>
          <label>Şifre *<input name="password" type="password" required autoComplete="new-password" {...inv("password")} /></label>
          <label>Şifre (tekrar) *<input name="password2" type="password" required autoComplete="new-password" {...inv("password2")} /></label>
        </div>
        <p className="muted small">Şifre en az 8 karakter; harf ve rakam içermeli.{st && !st.ok ? " Güvenlik için şifre alanları hata sonrası temizlenir." : ""}</p>
      </fieldset>
      <fieldset><legend>3 · Metinler</legend>
        {texts.map((t) => <details key={t.code}><summary>{t.title}</summary><div className="contract-scroll">{t.node}</div></details>)}
        <label className="check"><input type="checkbox" name="kvkk" required defaultChecked={v.kvkk === "on"} {...inv("kvkk")} /> {text("KVKK_AYDINLATMA")?.title ?? "KVKK aydınlatma metnini"} okudum. *</label>
        <label className="check"><input type="checkbox" name="acceptContracts" defaultChecked={v.acceptContracts === "on"} /> Hizmet sözleşmesini ve ödeme taahhütnamesini firma adına şimdi onaylıyorum (sonra da onaylayabilirsiniz; talep göndermek için gereklidir).</label>
      </fieldset>
      {st && !st.ok && <div className="alert bad" role="alert"><span>✕</span><div>{st.message}</div></div>}
      <button className="btn orange big" disabled={pending}>{pending ? "Hesap oluşturuluyor…" : "Hesabı oluştur ve devam et"}</button>
    </form>
  );
}
