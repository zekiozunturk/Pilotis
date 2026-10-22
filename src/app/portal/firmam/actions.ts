"use server";
import { revalidatePath } from "next/cache";
import { and, eq, or, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { appUrl, queueEmail } from "@/lib/notify";
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

export type InviteState = { ok: boolean; message: string; link?: string } | null;
async function partyAdminCtx() {
  const scope = await currentScope(); const u = await currentUser();
  if (!scope.external || !scope.partyId || !u) throw new Error("Yetki yok");
  const [me] = await db.select().from(s.users).where(eq(s.users.id, u.id));
  // yönetici önizlemesinde de çalışsın
  if (!me.partyAdmin && !u.roles.includes("SYSTEM_ADMIN")) throw new Error("Firmanıza kullanıcı eklemek için firma yetkilisi olmalısınız");
  return { partyId: scope.partyId, me: u };
}
/** Firma yetkilisi kendi firmasına kullanıcı davet eder: şifre e-postayla gönderilmez, etkinleştirme bağlantısı gider (72 saat) */
export async function inviteUser(_: InviteState, f: FormData): Promise<InviteState> {
  try {
    const { partyId, me } = await partyAdminCtx();
    const name = String(f.get("name") ?? "").trim(), email = String(f.get("email") ?? "").trim().toLocaleLowerCase("tr"), username = String(f.get("username") ?? "").trim().toLocaleLowerCase("tr");
    if (name.length < 3) return { ok: false, message: "Ad soyad gerekli" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Geçerli bir iş e-postası girin" };
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return { ok: false, message: "Kullanıcı adı 3–32 karakter: küçük harf, rakam, nokta, tire" };
    const [dup] = await db.select({ id: s.users.id }).from(s.users).where(or(eq(s.users.username, username), sql`lower(${s.users.email}) = ${email}`));
    if (dup) return { ok: false, message: "Bu kullanıcı adı veya e-posta kullanımda" };
    const canApprove = f.get("billing") === "on";
    const [u] = await db.insert(s.users).values({ username, email, name, title: String(f.get("title") ?? "").trim() || null, phone: String(f.get("phone") ?? "").trim() || null, roles: canApprove ? ["CUSTOMER", "BILLING_PARTY"] : ["CUSTOMER"], partyId, partyAdmin: f.get("admin") === "on", passwordHash: null }).returning();
    const token = randomBytes(32).toString("base64url");
    await db.insert(s.passwordResets).values({ id: createHash("sha256").update(token).digest("hex"), userId: u.id, expiresAt: new Date(Date.now() + 72 * 3_600_000) });
    const [p] = await db.select({ n: s.parties.legalName }).from(s.parties).where(eq(s.parties.id, partyId));
    const link = `/sifre-sifirla?t=${token}`;
    const sent = await queueEmail(email, { kind: "USER_INVITED", title: `${p.n} — PILOTIS hesabınız açıldı`, body: `Merhaba ${name},\n${me.name}, sizi ${p.n} adına Yalova Pilotaj müşteri portalına ekledi. Kullanıcı adınız: ${username}\nAşağıdaki bağlantıdan şifrenizi belirleyin (72 saat geçerli).`, link });
    await db.insert(s.auditLog).values({ entity: "user", entityId: u.id, action: "USER_INVITED", after: { partyId, username, email, billing: canApprove }, actorId: me.username ?? me.email });
    revalidatePath("/portal/firmam");
    const demo = process.env.DEMO_LOGINS !== "0" && sent.status !== "SENT";
    return { ok: true, message: `${name} eklendi; etkinleştirme bağlantısı ${email} adresine ${sent.status === "SENT" ? "gönderildi" : "kuyruğa alındı (e-posta altyapısı tanımlanınca gider)"}`, link: demo ? `${appUrl()}${link}` : undefined };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
export async function toggleFirmUser(f: FormData) {
  const { partyId, me } = await partyAdminCtx();
  const id = String(f.get("id")); const act = String(f.get("act"));
  if (id === me.id) throw new Error("Kendi hesabınızı kapatamazsınız");
  const [u] = await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.partyId, partyId)));
  if (!u) throw new Error("Kullanıcı bulunamadı");
  if (act === "off") { await db.update(s.users).set({ active: false }).where(eq(s.users.id, id)); await db.delete(s.sessions).where(eq(s.sessions.userId, id)); }
  if (act === "on") await db.update(s.users).set({ active: true }).where(eq(s.users.id, id));
  await db.insert(s.auditLog).values({ entity: "user", entityId: id, action: act === "off" ? "USER_DEACTIVATE" : "USER_ACTIVATE", actorId: me.username ?? me.email });
  revalidatePath("/portal/firmam");
}
