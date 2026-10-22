"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

export function SubmitButton({ children, className = "btn", name, value }: { children: ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  // pending iken buton kilitlenir: çift tıklama ikinci kez göndermez
  return <button className={className} disabled={pending} name={name} value={value} type="submit">{pending ? "Kaydediliyor…" : children}</button>;
}

export function ActionForm({ action, children, hidden = {}, className, resetOnOk }: { action: Action; children: ReactNode; hidden?: Record<string, string>; className?: string; resetOnOk?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form action={formAction} className={className} ref={ref}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state && (
        <div className={`alert ${state.ok ? "ok" : "bad"}`} style={{ marginTop: 8 }} role="status">
          {state.ok ? "✓" : "⚠"} {state.message}{state.ok && state.at ? ` — ${new Date(state.at).toLocaleTimeString("tr-TR")}` : ""}
        </div>
      )}
    </form>
  );
}
