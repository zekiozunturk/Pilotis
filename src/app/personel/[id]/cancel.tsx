"use client";
import { useActionState } from "react";
import { cancelShift, type PlanState } from "@/app/planlama/actions";

export function CancelShift({ id }: { id: string }) {
  const [st, act, pending] = useActionState<PlanState, FormData>(cancelShift, null);
  return (
    <details>
      <summary style={{ cursor: "pointer", fontSize: 12 }}>İptal</summary>
      <form action={act} style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <input type="hidden" name="shiftId" value={id} />
        <input name="reason" placeholder="Gerekçe *" required style={{ minWidth: 120, padding: "3px 6px" }} />
        <button className="btn danger" style={{ minHeight: 26, padding: "2px 8px" }} disabled={pending}>İptal et</button>
      </form>
      {st && <div style={{ fontSize: 11.5, color: st.ok ? "var(--ok)" : "var(--bad)" }}>{st.message}</div>}
    </details>
  );
}
