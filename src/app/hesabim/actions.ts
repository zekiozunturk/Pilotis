"use server";
import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { db, schema as s } from "@/db";
import { requireUser, SESSION_COOKIE } from "@/lib/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

export type PwState = { ok: boolean; message: string } | null;
export async function changePassword(_: PwState, f: FormData): Promise<PwState> {
  const u = await requireUser();
  const [row] = await db.select().from(s.users).where(eq(s.users.id, u.id));
  const cur = String(f.get("current") ?? ""), nw = String(f.get("next") ?? ""), again = String(f.get("again") ?? "");
  if (!verifyPassword(cur, row.passwordHash)) return { ok: false, message: "Mevcut şifre hatalı" };
  if (nw !== again) return { ok: false, message: "Yeni şifreler aynı değil" };
  const p = passwordProblem(nw); if (p) return { ok: false, message: p };
  if (nw === cur) return { ok: false, message: "Yeni şifre eskisiyle aynı olamaz" };
  await db.update(s.users).set({ passwordHash: hashPassword(nw), mustChangePassword: false }).where(eq(s.users.id, u.id));
  // diğer cihazlardaki oturumlar kapatılır
  const t = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await db.delete(s.sessions).where(and(eq(s.sessions.userId, u.id), ne(s.sessions.id, createHash("sha256").update(t).digest("hex"))));
  await db.insert(s.auditLog).values({ entity: "user", entityId: u.id, action: "PASSWORD_CHANGED", actorId: u.username ?? u.email });
  return { ok: true, message: "Şifreniz değiştirildi; diğer cihazlardaki oturumlar kapatıldı" };
}
