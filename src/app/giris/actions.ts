"use server";
import { redirect } from "next/navigation";
import { eq, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession, EXTERNAL_ROLES } from "@/lib/session";
import type { Role } from "@/lib/workflow";

export type LoginState = { ok: false; message: string; user?: string } | null;
const LOCK_AFTER = 5, LOCK_MIN = 10;

/** Rolün açılış ekranı */
export async function homeFor(roles: Role[]): Promise<string> {
  const r = roles[0];
  if (EXTERNAL_ROLES.includes(r)) return "/portal";
  if (["PILOT", "TUG_MASTER", "CREW"].includes(r)) return "/saha";
  if (r === "ACCOUNTING") return "/muhasebe";
  if (r === "SYSTEM_ADMIN") return "/yonetim";
  return "/";
}

export async function login(_: LoginState, f: FormData): Promise<LoginState> {
  const id = String(f.get("user") ?? "").trim().toLocaleLowerCase("tr");
  const pw = String(f.get("password") ?? "");
  const next = String(f.get("sonra") ?? "");
  if (!id || !pw) return { ok: false, message: "Kullanıcı adı ve şifre gerekli", user: id };
  const [u] = await db.select().from(s.users).where(or(eq(s.users.username, id), sql`lower(${s.users.email}) = ${id}`));
  const fail = "Kullanıcı adı veya şifre hatalı";
  if (!u || !u.active) return { ok: false, message: fail, user: id };
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, message: `Çok sayıda hatalı deneme — hesap ${Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000)} dakika kilitli`, user: id };
  if (!verifyPassword(pw, u.passwordHash)) {
    const n = u.failedLogins + 1;
    await db.update(s.users).set({ failedLogins: n, lockedUntil: n >= LOCK_AFTER ? new Date(Date.now() + LOCK_MIN * 60000) : null }).where(eq(s.users.id, u.id));
    await db.insert(s.auditLog).values({ entity: "auth", entityId: u.id, action: "LOGIN_FAILED", actorId: u.username ?? u.email });
    return { ok: false, message: n >= LOCK_AFTER ? `Hesap ${LOCK_MIN} dakika kilitlendi` : fail, user: id };
  }
  if (u.partyId) { const [p] = await db.select().from(s.parties).where(eq(s.parties.id, u.partyId)); if (p?.registrationStatus === "SUSPENDED") return { ok: false, message: "Firma hesabı askıya alınmış — Yalova Pilotaj ile iletişime geçin", user: id }; }
  await db.update(s.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(s.users.id, u.id));
  await createSession(u.id);
  await db.insert(s.auditLog).values({ entity: "auth", entityId: u.id, action: "LOGIN", actorId: u.username ?? u.email });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : await homeFor(u.roles as Role[]));
}

export async function logout() {
  await destroySession();
  redirect("/giris");
}
