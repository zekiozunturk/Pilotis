"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser, ROLE_LABELS } from "@/lib/session";
import { hashPassword, passwordProblem } from "@/lib/password";
import type { Role } from "@/lib/workflow";

export type AdminState = { ok: boolean; message: string } | null;
async function admin() { const u = await requireUser(); if (!u.roles.includes("SYSTEM_ADMIN")) throw new Error("Yalnız sistem yöneticisi"); return u; }
const audit = (actor: string, action: string, id: string, after?: object) => db.insert(s.auditLog).values({ entity: "user", entityId: id, action, after: after ?? null, actorId: actor });

export async function createUser(_: AdminState, f: FormData): Promise<AdminState> {
  try {
    const me = await admin();
    const username = String(f.get("username") ?? "").trim().toLocaleLowerCase("tr");
    const role = String(f.get("role") ?? "") as Role;
    const pw = String(f.get("password") ?? "");
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return { ok: false, message: "Kullanıcı adı 3–32 karakter: küçük harf, rakam, nokta, tire" };
    if (!(role in ROLE_LABELS)) return { ok: false, message: "Rol seçin" };
    const p = passwordProblem(pw); if (p) return { ok: false, message: p };
    const partyId = String(f.get("partyId") || "") || null, personnelId = String(f.get("personnelId") || "") || null;
    if (["CUSTOMER", "BILLING_PARTY"].includes(role) && !partyId) return { ok: false, message: "Müşteri kullanıcısı bir firmaya bağlanmalı" };
    const roles: Role[] = role === "CUSTOMER" ? ["CUSTOMER", "BILLING_PARTY"] : [role];
    const [u] = await db.insert(s.users).values({ username, name: String(f.get("name") ?? "").trim() || username, email: String(f.get("email") ?? "").trim() || `${username}@pilotis.local`, title: String(f.get("title") ?? "").trim() || null, roles, partyId, personnelId, passwordHash: hashPassword(pw), mustChangePassword: f.get("mustChange") === "on" }).returning();
    await audit(me.username ?? me.email, "USER_CREATE", u.id, { username, roles });
    revalidatePath("/yonetim/kullanicilar");
    return { ok: true, message: `${username} oluşturuldu` };
  } catch (e) { const m = (e as Error).message; return { ok: false, message: /unique|duplicate/i.test(m) ? "Kullanıcı adı, e-posta veya personel kaydı başka kullanıcıda" : m }; }
}

export async function userAction(f: FormData) {
  const me = await admin();
  const id = String(f.get("id")), act = String(f.get("act"));
  if (id === me.id && ["deactivate", "role"].includes(act)) throw new Error("Kendi hesabınızı kapatamazsınız");
  if (act === "deactivate" || act === "activate") { await db.update(s.users).set({ active: act === "activate" }).where(eq(s.users.id, id)); if (act === "deactivate") await db.delete(s.sessions).where(eq(s.sessions.userId, id)); }
  if (act === "unlock") await db.update(s.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(s.users.id, id));
  if (act === "logout") await db.delete(s.sessions).where(eq(s.sessions.userId, id));
  if (act === "reset") {
    const pw = String(f.get("password") ?? "");
    const p = passwordProblem(pw); if (p) throw new Error(p);
    await db.update(s.users).set({ passwordHash: hashPassword(pw), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(s.users.id, id));
    await db.delete(s.sessions).where(eq(s.sessions.userId, id));
  }
  await audit(me.username ?? me.email, `USER_${act.toUpperCase()}`, id);
  revalidatePath("/yonetim/kullanicilar");
}

export async function partyAction(f: FormData) {
  const me = await admin();
  const id = String(f.get("id")), status = String(f.get("status"));
  if (!["ACTIVE", "SUSPENDED", "PENDING_REVIEW"].includes(status)) return;
  await db.update(s.parties).set({ registrationStatus: status }).where(eq(s.parties.id, id));
  await db.insert(s.auditLog).values({ entity: "party", entityId: id, action: `REGISTRATION_${status}`, actorId: me.username ?? me.email });
  revalidatePath("/yonetim");
}
