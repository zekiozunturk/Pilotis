"use server";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { LEAD_KEY } from "@/lib/lead-time";
export type LeadState = { ok: boolean; message: string } | null;
export async function saveLeadHours(_: LeadState, f: FormData): Promise<LeadState> {
  const role = await currentRole();
  if (!["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"].includes(role)) return { ok: false, message: "Yetki yok" };
  const h = Number(String(f.get("hours") ?? "").replace(",", "."));
  const reason = String(f.get("reason") ?? "").trim();
  if (!Number.isFinite(h) || h < 0 || h > 72) return { ok: false, message: "0–72 saat arası bir değer girin" };
  if (reason.length < 5) return { ok: false, message: "Gerekçe yazın" };
  await db.insert(s.appSettings).values({ key: LEAD_KEY, value: h, updatedBy: role }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: h, updatedBy: role, updatedAt: new Date() } });
  await db.insert(s.auditLog).values({ entity: "app_settings", entityId: LEAD_KEY, action: "UPDATE", after: { hours: h }, reason, actorId: ROLE_LABELS[role] });
  revalidatePath("/ayarlar"); revalidatePath("/portal");
  return { ok: true, message: `Asgari bildirim süresi ${h} saat olarak kaydedildi` };
}
