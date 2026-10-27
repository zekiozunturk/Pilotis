import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Role } from "./workflow";
import { endLogs, logLogin } from "./session-log";
/** Çerezdeki belirtecin veritabanı kimliği (oturum kaydı için) */
export async function currentSessionId() { const t = (await cookies()).get(SESSION_COOKIE)?.value; return t ? tokenHash(t) : null; }

export const ROLE_LABELS: Record<Role, string> = {
  SYSTEM_ADMIN: "Sistem yöneticisi", BUSINESS_MANAGER: "İşletme yöneticisi", OPERATIONS_MANAGER: "Operasyon yöneticisi",
  PLANNER: "Planlamacı", SHORE_OPS: "Kıyı operasyon sorumlusu", PILOT: "Kılavuz kaptan", TUG_MASTER: "Römorkör kaptanı",
  CREW: "Mürettebat", ACCOUNTING: "Muhasebe", TARIFF_OFFICER: "Tarife/mevzuat sorumlusu", CUSTOMER: "Müşteri/acente",
  BILLING_PARTY: "Fatura muhatabı", AUDITOR: "Denetçi",
};
export const EXTERNAL_ROLES: Role[] = ["CUSTOMER", "BILLING_PARTY"];
export const SESSION_COOKIE = "pilotis_sid";
const SESSION_DAYS = 7;
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

export interface SessionUser { id: string; name: string; username: string | null; email: string; roles: Role[]; partyId: string | null; personnelId: string | null; title: string | null; isDemo: boolean; mustChangePassword: boolean }

/** Oturumdaki kullanıcı (istek başına bir kez okunur) */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const [row] = await db.select({ u: s.users, sess: s.sessions }).from(s.sessions).innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, tokenHash(t)), gt(s.sessions.expiresAt, new Date())));
  if (!row || !row.u.active) return null;
  // kayan oturum: son görülme 10 dakikada bir güncellenir
  if (Date.now() - row.sess.lastSeenAt.getTime() > 600_000) await db.update(s.sessions).set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) }).where(eq(s.sessions.id, row.sess.id));
  const u = row.u;
  return { id: u.id, name: u.name, username: u.username, email: u.email, roles: u.roles as Role[], partyId: u.partyId, personnelId: u.personnelId, title: u.title, isDemo: u.isDemo, mustChangePassword: u.mustChangePassword };
});

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null, userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(s.sessions).values({ id: tokenHash(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5), ip, userAgent });
  const [u] = await db.select({ un: s.users.username, em: s.users.email }).from(s.users).where(eq(s.users.id, userId));
  await logLogin({ sessionId: tokenHash(token), userId, username: u?.un ?? u?.em ?? userId, ip, userAgent });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.COOKIE_SECURE === "1", maxAge: SESSION_DAYS * 86400 });
}
export async function destroySession() {
  const c = await cookies();
  const t = c.get(SESSION_COOKIE)?.value;
  if (t) { await endLogs([tokenHash(t)], "LOGOUT"); await db.delete(s.sessions).where(eq(s.sessions.id, tokenHash(t))); }
  for (const k of [SESSION_COOKIE, "pilotis_role", "pilotis_party", "pilotis_person"]) c.delete(k);
}

/** Oturum zorunlu — yoksa giriş ekranına */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/giris");
  return u;
}

/**
 * Etkin rol: kullanıcının birincil rolü. Sistem yöneticisi sunum/destek için "rol önizleme" yapabilir
 * (pilotis_role çerezi yalnız yöneticide dikkate alınır; önizleme denetim kaydına yöneticinin kimliğiyle düşer).
 */
export async function currentRole(): Promise<Role> {
  const u = await requireUser();
  if (u.roles.includes("SYSTEM_ADMIN")) {
    const r = (await cookies()).get("pilotis_role")?.value as Role | undefined;
    if (r && r in ROLE_LABELS) return r;
    return "SYSTEM_ADMIN";
  }
  return u.roles[0] ?? "CREW";
}
/** Kullanıcının bütün rolleri (ör. müşteri + fatura muhatabı) */
export async function currentRoles(): Promise<Role[]> {
  const u = await requireUser();
  const r = await currentRole();
  return u.roles.includes("SYSTEM_ADMIN") && r !== "SYSTEM_ADMIN" ? [r] : u.roles;
}
export async function isPreviewing() { const u = await currentUser(); return !!u?.roles.includes("SYSTEM_ADMIN") && (await currentRole()) !== "SYSTEM_ADMIN"; }

/** Dış kullanıcı (müşteri/muhatap) hangi firma adına? Firma, kullanıcı-firma ilişkisinden gelir; önizlemede yöneticinin seçtiği firma. */
export async function currentScope(): Promise<{ role: Role; partyId: string | null; external: boolean }> {
  const u = await requireUser();
  const role = await currentRole();
  const external = EXTERNAL_ROLES.includes(role);
  const partyId = external ? (u.roles.includes("SYSTEM_ADMIN") ? (await cookies()).get("pilotis_party")?.value ?? null : u.partyId) : null;
  return { role, external, partyId };
}
/** Kişisel analiz görünümü için personel kaydı */
export async function currentPersonId(): Promise<string | null> {
  const u = await requireUser();
  if (u.roles.includes("SYSTEM_ADMIN")) return (await cookies()).get("pilotis_person")?.value ?? null;
  return u.personnelId;
}

/** Yalnız işletme personeline açık sayfalar: dış kullanıcıya varlığı dahi gösterilmez. */
export async function requireInternalPage() {
  const { notFound } = await import("next/navigation");
  if ((await currentScope()).external) notFound();
}
