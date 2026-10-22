"use client";
import { useActionState } from "react";
import { sendTest, type T } from "./actions";
import { submitWith } from "@/components/ActionForm";
export function TestForm({ email }: { email: string }) {
  const [st, action, pending] = useActionState<T, FormData>(sendTest, null);
  return (
    <form onSubmit={submitWith(action)} className="toolbar">
      <input name="to" type="email" defaultValue={email} aria-label="Deneme alıcısı" style={{ maxWidth: 280 }} />
      <button className="btn secondary" disabled={pending}>Deneme e-postası gönder</button>
      {st && <span role="status" className={`badge ${st.ok ? "ok" : "bad"}`}>{st.message}</span>}
    </form>
  );
}
