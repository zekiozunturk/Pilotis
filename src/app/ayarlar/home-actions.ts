"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/session";
import { HOME_DEFAULT_KEY } from "@/lib/home-variant";
/** Kişisel ana sayfa seçimi ("" = kurum varsayılanını kullan) */
export async function setHomeVariant(f: FormData) {
  const u = await requireUser();
  const v = String(f.get("variant") ?? "");
  await db.update(s.users).set({ homeVariant: v === "MAP" || v === "CLASSIC" ? v : null }).where(eq(s.users.id, u.id));
  revalidatePath("/"); revalidatePath("/ayarlar");
}
/** Kurum varsayılanı — yalnız sistem/işletme yöneticisi */
export async function setHomeDefault(f: FormData) {
  const u = await requireUser();
  if (!u.roles.some((r) => r === "SYSTEM_ADMIN" || r === "BUSINESS_MANAGER")) throw new Error("Yetki yok");
  const v = String(f.get("variant")) === "MAP" ? "MAP" : "CLASSIC";
  await db.insert(s.appSettings).values({ key: HOME_DEFAULT_KEY, value: v, updatedBy: u.username ?? u.email }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: v, updatedBy: u.username ?? u.email, updatedAt: new Date() } });
  await db.insert(s.auditLog).values({ entity: "app_settings", entityId: HOME_DEFAULT_KEY, action: "UPDATE", after: { variant: v }, actorId: u.username ?? u.email });
  revalidatePath("/"); revalidatePath("/ayarlar");
}
