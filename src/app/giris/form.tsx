"use client";
import { useActionState, useRef, useState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next, demo }: { next: string; demo: { username: string; name: string; role: string; desc: string }[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  const [show, setShow] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const userRef = useRef<HTMLInputElement>(null), pwRef = useRef<HTMLInputElement>(null);
  const quick = (u: string) => { if (!userRef.current || !pwRef.current) return; userRef.current.value = u; pwRef.current.value = "123456"; form.current?.requestSubmit(); };
  return (
    <>
      <form ref={form} action={action} className="auth-fields" noValidate>
        <input type="hidden" name="sonra" value={next} />
        <label>Kullanıcı adı veya e-posta
          <input ref={userRef} name="user" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={state?.user ?? ""} required autoFocus aria-invalid={!!state && !state.ok} />
        </label>
        <label>Şifre
          <span className="pw">
            <input ref={pwRef} name="password" type={show ? "text" : "password"} autoComplete="current-password" required aria-invalid={!!state && !state.ok} />
            <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}>{show ? "Gizle" : "Göster"}</button>
          </span>
        </label>
        {state && !state.ok && <div className="alert bad" role="alert"><span>✕</span><div>{state.message}</div></div>}
        <button className="btn orange big" disabled={pending}>{pending ? "Giriş yapılıyor…" : "Giriş yap"}</button>
      </form>
      {demo.length > 0 && (
        <div className="auth-demo">
          <div className="auth-demo-h"><b>Sunum hesapları</b><span className="muted small">şifre: 123456 · canlıda kapatılır</span></div>
          <div className="auth-demo-grid">
            {demo.map((d) => (
              <button key={d.username} type="button" className="auth-demo-btn" onClick={() => quick(d.username)} disabled={pending}>
                <span className="u mono">{d.username}</span><span className="r">{d.role}</span><span className="d">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
