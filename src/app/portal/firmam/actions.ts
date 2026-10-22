"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope, currentUser } from "@/lib/session";
export type FirmState = { ok: boolean; message: string } | null;
/** Müşteri iletişim bilgilerini günceller; unvan ve vergi no değişikliği Yalova Pilotaj onayıyla yapılır */
export async function updateFirm(_: FirmState, f: FormData): Promise<FirmState> {
  const scope = await currentScope(); const u = await currentUser();
  if (!scope.external || !scope.partyId) return { ok: false, message: "Yetki yok" };
  const g = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };
  const email = g("email"); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Geçersiz e-posta" };
  const [before] = await db.select().from(s.parties).where(eq(s.parties.id, scope.partyId));
  const after = { address: g("address"), city: g("city"), phone: g("phone"), email, taxOffice: g("taxOffice"), website: g("website") };
  await db.update(s.parties).set({ ...after, version: before.version + 1, updatedAt: new Date() }).where(eq(s.parties.id, scope.partyId));
  await db.insert(s.auditLog).values({ entity: "party", entityId: scope.partyId, action: "SELF_UPDATE", before: { address: before.address, city: before.city, phone: before.phone, email: before.email, taxOffice: before.taxOffice, website: before.website }, after, actorId: u?.username ?? "musteri" });
  revalidatePath("/portal/firmam");
  return { ok: true, message: "Firma iletişim bilgileri güncellendi" };
}
