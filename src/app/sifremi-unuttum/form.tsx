"use client";
import { useActionState } from "react";
import { requestReset, doReset, type ResetState } from "./actions";
import { submitWith } from "@/components/ActionForm";
export function RequestForm() {
  const [st, action, pending] = useActionState<ResetState, FormData>(requestReset, null);
  return (
    <form onSubmit={submitWith(action)} className="auth-fields">
      <label>Kullanıcı adı veya e-posta<input name="user" autoComplete="username" autoCapitalize="none" required autoFocus /></label>
      {st && <div className={`alert ${st.ok ? "ok" : "bad"}`} role="status"><span>{st.ok ? "✓" : "✕"}</span><div>{st.message}{st.demoLink && <><br /><b>Sunum modu:</b> e-posta altyapısı tanımlı olmadığı için bağlantı burada gösteriliyor — <a href={st.demoLink}>şifreyi sıfırla</a></>}</div></div>}
      <button className="btn orange big" disabled={pending}>{pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}</button>
    </form>
  );
}
export function ResetForm({ token }: { token: string }) {
  const [st, action, pending] = useActionState<ResetState, FormData>(doReset, null);
  if (st?.ok) return <div className="alert ok" role="status"><span>✓</span><div>{st.message} <a href="/giris">Giriş ekranına git →</a></div></div>;
  return (
    <form onSubmit={submitWith(action)} className="auth-fields">
      <input type="hidden" name="t" value={token} />
      <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus /></label>
      <label>Yeni şifre (tekrar)<input name="password2" type="password" autoComplete="new-password" required minLength={8} /></label>
      <p className="muted small">En az 8 karakter; harf ve rakam içermeli. Değişiklikten sonra bütün cihazlardaki oturumlar kapanır.</p>
      {st && !st.ok && <div className="alert bad" role="alert"><span>✕</span><div>{st.message}</div></div>}
      <button className="btn orange big" disabled={pending}>Şifremi değiştir</button>
    </form>
  );
}
