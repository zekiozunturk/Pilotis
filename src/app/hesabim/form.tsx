"use client";
import { useActionState } from "react";
import { changePassword, savePrefs, type PwState } from "./actions";
import { submitWith } from "@/components/ActionForm";
export function PasswordForm() {
  const [st, action, pending] = useActionState<PwState, FormData>(changePassword, null);
  return (
    <form action={action} className="grid" style={{ gap: 10 }}>
      <label>Mevcut şifre<input name="current" type="password" autoComplete="current-password" required /></label>
      <label>Yeni şifre<input name="next" type="password" autoComplete="new-password" required minLength={8} /></label>
      <label>Yeni şifre (tekrar)<input name="again" type="password" autoComplete="new-password" required minLength={8} /></label>
      <div className="toolbar"><button className="btn orange" disabled={pending}>Şifreyi değiştir</button>{st && <span role="status" className={`badge ${st.ok ? "ok" : "bad"}`}>{st.message}</span>}</div>
      <p className="muted small">En az 8 karakter; harf ve rakam içermeli.</p>
    </form>
  );
}

export function PrefsForm({ email, notifyEmail, notifySms, phone }: { email: string; notifyEmail: boolean; notifySms: boolean; phone: string | null }) {
  const [st, action, pending] = useActionState<PwState, FormData>(savePrefs, null);
  return (
    <form onSubmit={submitWith(action)} className="grid" style={{ gap: 10 }}>
      <label className="check"><input type="checkbox" name="notifyEmail" defaultChecked={notifyEmail} /> E-posta ile bildir ({email})</label>
      <label className="check"><input type="checkbox" name="notifySms" defaultChecked={notifySms} /> Acil olaylarda SMS gönder (talep kararı, onay bekleyen iş, yeni görev, iş tamamlandı)</label>
      <label>Cep telefonu<input name="phone" inputMode="tel" defaultValue={phone ?? ""} placeholder="05xx xxx xx xx" /></label>
      <div className="toolbar"><button className="btn" disabled={pending}>Kaydet</button>{st && <span role="status" className={`badge ${st.ok ? "ok" : "bad"}`}>{st.message}</span>}</div>
      <p className="muted small">Sistem içi bildirimler her zaman açıktır (sağ üstteki zil).</p>
    </form>
  );
}
