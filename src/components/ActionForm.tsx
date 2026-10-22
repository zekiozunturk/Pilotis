"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/app/actions";
import { useRouter } from "next/navigation";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;
const Pending = createContext(false);

/**
 * React 19'da <form action> gönderimden sonra alanları sıfırlar; hata durumunda kullanıcının yazdıkları kaybolur.
 * Bu yardımcı gönderimi elle yapar: alanlar korunur, basılan düğmenin name/value değeri de gönderilir.
 */
export function submitWith(dispatch: (f: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter ?? undefined);
    startTransition(() => dispatch(fd));
  };
}

export function SubmitButton({ children, className = "btn", name, value }: { children: ReactNode; className?: string; name?: string; value?: string }) {
  const pending = useContext(Pending);
  // pending iken buton kilitlenir: çift tıklama ikinci kez göndermez
  return <button className={className} disabled={pending} name={name} value={value} type="submit">{pending ? "Kaydediliyor…" : children}</button>;
}

export function ActionForm({ action, children, hidden = {}, className, resetOnOk }: { action: Action; children: ReactNode; hidden?: Record<string, string>; className?: string; resetOnOk?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => { if (state?.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  // Sunucu yönlendirmesi yerine istemci yönlendirmesi: aynı sayfaya yönlendirmede takılmayı önler
  useEffect(() => { if (state?.ok && state.redirectTo) router.push(state.redirectTo); }, [state, router]);
  return (
    <Pending.Provider value={pending}>
      <form onSubmit={submitWith(formAction)} className={className} ref={ref}>
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {children}
        {state && (
          <div className={`alert ${state.ok ? "ok" : "bad"}`} style={{ marginTop: 8 }} role="status">
            {state.ok ? "✓" : "⚠"} {state.message}{state.ok && state.at ? ` — ${new Date(state.at).toLocaleTimeString("tr-TR")}` : ""}
          </div>
        )}
      </form>
    </Pending.Provider>
  );
}
