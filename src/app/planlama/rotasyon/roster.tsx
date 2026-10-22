"use client";
import { useActionState } from "react";
import { assignTeam, type RState } from "./actions";

export function SlotSelect({ team, role, current, options }: { team: string; role: string; current: string | null; options: { id: string; name: string; teamLabel: string | null }[] }) {
  const [st, act, pending] = useActionState<RState, FormData>(assignTeam, null);
  return (
    <form action={act} style={{ display: "grid", gap: 2 }}>
      <input type="hidden" name="team" value={team} />
      <select name="personnelId" defaultValue={current ?? ""} disabled={pending} aria-label={`${team} ${role}`}
        onChange={(e) => { const f = e.currentTarget.form!; if (!e.currentTarget.value && current) { const fd = new FormData(); fd.set("personnelId", current); fd.set("team", ""); act(fd); } else f.requestSubmit(); }}
        style={{ fontSize: 12, padding: "3px 6px", borderColor: current ? undefined : "var(--bad)", color: current ? undefined : "var(--bad)" }}>
        <option value="">{current ? "— ekipten çıkar —" : "BOŞ — kişi seçin"}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name.replace("ÖRNEK ", "")}{o.teamLabel && o.id !== current ? ` (şu an: ${o.teamLabel})` : ""}</option>)}
      </select>
      {st && !st.ok && <span role="status" style={{ fontSize: 11, color: "var(--bad)" }}>{st.message}</span>}
    </form>
  );
}
