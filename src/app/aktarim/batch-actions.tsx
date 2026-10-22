"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approve, revert } from "./actions";
export function BatchActions({ id, status, canApprove, canRevert }: { id: string; status: string; canApprove: boolean; canRevert: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => { const r = await fn(); setMsg(r.message); router.refresh(); });
  };
  return (
    <>
      {status === "AWAITING_APPROVAL" && canApprove && <button className="btn orange" disabled={pending} onClick={() => run(() => approve(id))}>Onayla ve çalıştır</button>}
      {status === "DONE" && canRevert && <button className="btn danger" disabled={pending} onClick={() => run(() => revert(id), "Bu aktarımın yaptığı değişiklikler geri alınacak. Aktarımdan sonra değişen veya başka kayıtlara bağlanan kayıtlar korunur. Devam edilsin mi?")}>Geri al</button>}
      {msg && <div className="small" role="status">{msg}</div>}
    </>
  );
}
