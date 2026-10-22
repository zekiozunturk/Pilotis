"use client";
import { useActionState } from "react";
import { acceptContract, type AcceptState } from "./actions";
import { SignaturePad } from "@/components/SignaturePad";
import { submitWith } from "@/components/ActionForm";
export function AcceptForm({ templateId, hash, signer, withSignature }: { templateId: string; hash: string; signer: { name: string; title: string }; withSignature?: boolean }) {
  const [st, action, pending] = useActionState<AcceptState, FormData>(acceptContract, null);
  if (st?.ok) return <div className="alert ok" role="status"><span>✓</span><div>{st.message}</div></div>;
  return (
    <form onSubmit={submitWith(action)} className="accept">
      <input type="hidden" name="templateId" value={templateId} /><input type="hidden" name="hash" value={hash} />
      <div className="grid g2" style={{ gap: 8 }}>
        <div className="field"><label>Onaylayan — ad soyad *</label><input name="signerName" defaultValue={signer.name} required minLength={3} /></div>
        <div className="field"><label>Unvan</label><input name="signerTitle" defaultValue={signer.title} /></div>
      </div>
      <label className="check"><input type="checkbox" name="read" required /> Metnin tamamını okudum.</label>
      <label className="check"><input type="checkbox" name="authority" required /> Firma adına onay vermeye yetkiliyim.</label>
      {withSignature && <details><summary className="small">İsteğe bağlı: imza çiz</summary><SignaturePad /></details>}
      {st && !st.ok && <div className="alert bad" role="alert"><span>✕</span><div>{st.message}</div></div>}
      <button className="btn orange" disabled={pending}>{pending ? "Kaydediliyor…" : "Okudum, firma adına onaylıyorum"}</button>
    </form>
  );
}
