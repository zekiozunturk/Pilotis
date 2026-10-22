"use client";
import { useActionState } from "react";
import { changePassword, type PwState } from "./actions";
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
