"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { acceptContract, type AcceptState } from "./actions";
import { SignaturePad } from "@/components/SignaturePad";
export function AcceptForm({ templateId, hash, signer, withSignature }: { templateId: string; hash: string; signer: { name: string; title: string }; withSignature?: boolean }) {
  const [st, setSt] = useState<AcceptState>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await acceptContract(null, fd); setSt(r); if (r?.ok) router.refresh(); }); };
  if (st?.ok) return <div className="alert ok" role="status"><span>✓</span><div>{st.message}</div></div>;
  return (
    <form onSubmit={onSubmit} className="accept">
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
