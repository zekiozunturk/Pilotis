"use client";
import { useActionState, useState } from "react";
import { createUser, type AdminState } from "../actions";
import { submitWith } from "@/components/ActionForm";
type O = { v: string; l: string };
export function NewUserForm({ roles, parties, people }: { roles: O[]; parties: O[]; people: O[] }) {
  const [st, action, pending] = useActionState<AdminState, FormData>(createUser, null);
  const [role, setRole] = useState("OPERATIONS_MANAGER");
  const external = ["CUSTOMER", "BILLING_PARTY"].includes(role);
  const field = ["PILOT", "TUG_MASTER", "CREW", "SHORE_OPS"].includes(role);
  return (
    <form onSubmit={submitWith(action)} className="grid2">
      <label>Kullanıcı adı<input name="username" required autoComplete="off" /></label>
      <label>Ad soyad<input name="name" required /></label>
      <label>E-posta<input name="email" type="email" /></label>
      <label>Unvan<input name="title" /></label>
      <label>Rol<select name="role" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></label>
      {external && <label>Firma (zorunlu)<select name="partyId" required><option value="">Seçin…</option>{parties.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select></label>}
      {field && <label>Personel kaydı<select name="personnelId"><option value="">Seçin…</option>{people.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select></label>}
      <label>Geçici şifre<input name="password" type="text" required autoComplete="new-password" placeholder="en az 8 karakter, harf ve rakam" /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "end" }}><input type="checkbox" name="mustChange" defaultChecked style={{ width: "auto", minHeight: 0 }} /> İlk girişte şifresini değiştirsin</label>
      <div style={{ gridColumn: "1/-1" }} className="toolbar">
        <button className="btn orange" disabled={pending}>Kullanıcı oluştur</button>
        {st && <span role="status" className={st.ok ? "badge ok" : "badge bad"}>{st.message}</span>}
      </div>
    </form>
  );
}
