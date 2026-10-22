"use server";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/session";
import { flushOutbox, queueEmail } from "@/lib/notify";
export type T = { ok: boolean; message: string } | null;
async function admin() { const u = await requireUser(); if (!u.roles.includes("SYSTEM_ADMIN")) throw new Error("Yalnız sistem yöneticisi"); return u; }
export async function sendTest(_: T, f: FormData): Promise<T> {
  try {
    await admin();
    const to = String(f.get("to") ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, message: "Geçerli bir e-posta girin" };
    const r = await queueEmail(to, { kind: "TEST", title: "Deneme e-postası", body: "Bu ileti PILOTIS e-posta ayarlarını denemek için gönderildi." });
    revalidatePath("/yonetim/bildirimler");
    return { ok: r.status === "SENT", message: r.status === "SENT" ? `${to} adresine gönderildi` : `Gönderilemedi: ${r.error ?? r.status}` };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
export async function retryAll() {
  await admin();
  const rows = await db.select({ id: s.outbox.id }).from(s.outbox).where(inArray(s.outbox.status, ["NO_CONFIG", "FAILED"]));
  if (rows.length) { await db.update(s.outbox).set({ status: "QUEUED", attempts: 0 }).where(inArray(s.outbox.id, rows.map((r) => r.id))); await flushOutbox(rows.map((r) => r.id)); }
  revalidatePath("/yonetim/bildirimler");
}
