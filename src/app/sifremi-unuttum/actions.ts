"use server";
import { headers } from "next/headers";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db, schema as s } from "@/db";
import { appUrl, queueEmail, smtpConfigured } from "@/lib/notify";
import { hashPassword, passwordProblem } from "@/lib/password";

export type ResetState = { ok: boolean; message: string; demoLink?: string } | null;
const SAME = "Bu bilgilerle kayıtlı bir hesap varsa şifre sıfırlama bağlantısı e-posta adresine gönderildi. Bağlantı 30 dakika geçerlidir.";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Sıfırlama bağlantısı iste — hesabın var olup olmadığı dışarı sızdırılmaz */
export async function requestReset(_: ResetState, f: FormData): Promise<ResetState> {
  const id = String(f.get("user") ?? "").trim().toLocaleLowerCase("tr");
  if (!id) return { ok: false, message: "Kullanıcı adı veya e-posta girin" };
  const [u] = await db.select().from(s.users).where(and(eq(s.users.active, true), or(eq(s.users.username, id), sql`lower(${s.users.email}) = ${id}`)));
  if (!u) return { ok: true, message: SAME };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.passwordResets).where(and(eq(s.passwordResets.userId, u.id), gt(s.passwordResets.createdAt, new Date(Date.now() - 3_600_000))));
  if (n >= 3) return { ok: true, message: SAME };
  const token = randomBytes(32).toString("base64url");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  await db.insert(s.passwordResets).values({ id: hash(token), userId: u.id, expiresAt: new Date(Date.now() + 30 * 60_000), ip });
  const link = `/sifre-sifirla?t=${token}`;
  await db.insert(s.auditLog).values({ entity: "auth", entityId: u.id, action: "PASSWORD_RESET_REQUEST", actorId: u.username ?? u.email });
  const sent = u.email.endsWith(".local") ? null : await queueEmail(u.email, { kind: "PASSWORD_RESET", title: "Şifre sıfırlama", body: `Merhaba ${u.name},\nPILOTIS hesabınız için şifre sıfırlama istendi. Aşağıdaki bağlantı 30 dakika geçerlidir ve bir kez kullanılabilir.\nBu isteği siz yapmadıysanız bu iletiyi dikkate almayın; şifreniz değişmez.`, link });
  // Sunum modu: e-posta altyapısı yoksa bağlantı ekranda gösterilir (canlıda DEMO_LOGINS=0 ve SMTP tanımlı olmalı)
  if (process.env.DEMO_LOGINS !== "0" && (!smtpConfigured() || !sent || sent.status !== "SENT")) return { ok: true, message: SAME, demoLink: `${appUrl()}${link}` };
  return { ok: true, message: SAME };
}

export async function doReset(_: ResetState, f: FormData): Promise<ResetState> {
  const token = String(f.get("t") ?? "");
  const pw = String(f.get("password") ?? ""), pw2 = String(f.get("password2") ?? "");
  const [r] = await db.select().from(s.passwordResets).where(and(eq(s.passwordResets.id, hash(token)), isNull(s.passwordResets.usedAt), gt(s.passwordResets.expiresAt, new Date())));
  if (!r) return { ok: false, message: "Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin." };
  const p = passwordProblem(pw); if (p) return { ok: false, message: p };
  if (pw !== pw2) return { ok: false, message: "Şifreler aynı değil" };
  await db.transaction(async (tx) => {
    await tx.update(s.passwordResets).set({ usedAt: new Date() }).where(eq(s.passwordResets.id, r.id));
    await tx.update(s.users).set({ passwordHash: hashPassword(pw), mustChangePassword: false, failedLogins: 0, lockedUntil: null }).where(eq(s.users.id, r.userId));
    await tx.delete(s.sessions).where(eq(s.sessions.userId, r.userId)); // bütün oturumlar kapanır
    await tx.insert(s.auditLog).values({ entity: "auth", entityId: r.userId, action: "PASSWORD_RESET_DONE", actorId: "reset-link" });
  });
  return { ok: true, message: "Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz." };
}
