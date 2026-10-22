"use server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { sanitize, PREF_LABEL, type UiPrefs, type PrefKey } from "@/lib/ui-prefs";
import { UI_COOKIE, getUiPolicy } from "@/lib/ui-prefs-server";

export type TState = { ok: boolean; message: string } | null;
const ADMINS = ["SYSTEM_ADMIN", "BUSINESS_MANAGER"];

/** Kişisel tercih — sayfa yenilenmeden uygulanır; kilitli alanlar kaydedilmez */
export async function savePersonal(p: Partial<UiPrefs>): Promise<TState> {
  const pol = await getUiPolicy();
  const clean = Object.fromEntries(Object.entries(sanitize(p)).filter(([k]) => !pol.locked.includes(k as PrefKey)));
  (await cookies()).set(UI_COOKIE, JSON.stringify(clean), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  const skipped = Object.keys(sanitize(p)).filter((k) => pol.locked.includes(k as PrefKey));
  return { ok: true, message: `Kişisel tercih kaydedildi${skipped.length ? ` (kurumsal kilitli alanlar uygulanmadı: ${skipped.map((k) => PREF_LABEL[k as PrefKey]).join(", ")})` : ""}` };
}
export async function resetPersonal(): Promise<TState> {
  (await cookies()).delete(UI_COOKIE);
  return { ok: true, message: "Kişisel tercihler sıfırlandı — rol/kurumsal varsayılan kullanılıyor" };
}
async function setSetting(key: string, value: unknown, role: string, reason: string) {
  const [prev] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, key));
  await db.insert(s.appSettings).values({ key, value: value as object, updatedBy: role }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: value as object, updatedBy: role, updatedAt: new Date() } });
  await db.insert(s.auditLog).values({ entity: "setting", entityId: key, action: "UPDATE", before: (prev?.value ?? null) as object, after: value as object, actorId: role, reason });
}
export async function saveCorporate(p: Partial<UiPrefs>, locked: PrefKey[]): Promise<TState> {
  const role = await currentRole();
  if (!ADMINS.includes(role)) return { ok: false, message: `Kurumsal varsayılanı yalnız sistem/işletme yöneticisi değiştirebilir (${ROLE_LABELS[role]})` };
  await setSetting("ui.corporate", sanitize(p), role, "Tema Stüdyosu — kurumsal varsayılan");
  await setSetting("ui.locked", locked.filter((k) => k in PREF_LABEL), role, "Tema Stüdyosu — kişiselleştirme izinleri");
  return { ok: true, message: `Kurumsal varsayılan kaydedildi; kilitli alanlar: ${locked.map((k) => PREF_LABEL[k]).join(", ") || "yok"}` };
}
export async function saveRoleDefault(targetRole: string, p: Partial<UiPrefs>): Promise<TState> {
  const role = await currentRole();
  if (!ADMINS.includes(role)) return { ok: false, message: "Rol başlangıç tercihini yalnız yönetici belirleyebilir" };
  const pol = await getUiPolicy();
  const roles = { ...pol.roles, [targetRole]: sanitize(p) };
  await setSetting("ui.roles", roles, role, `Tema Stüdyosu — ${targetRole} başlangıç tercihi`);
  return { ok: true, message: `${ROLE_LABELS[targetRole as keyof typeof ROLE_LABELS] ?? targetRole} rolünün başlangıç tercihi kaydedildi` };
}
