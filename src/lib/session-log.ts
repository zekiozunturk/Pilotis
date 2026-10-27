import "server-only";
/**
 * Oturum kayıtları: giriş/çıkış, hatalı denemeler, aktif süre ve sayfa gezintisi.
 * Aktif süre tarayıcıdan gelen nabızla (sekme görünürken dakikada bir) toplanır; sekme arka plandayken sayılmaz.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";

export type FailReason = "WRONG_PASSWORD" | "UNKNOWN_USER" | "LOCKED" | "SUSPENDED" | "INACTIVE";
export const FAIL_LABEL: Record<string, string> = { WRONG_PASSWORD: "Şifre hatalı", UNKNOWN_USER: "Kullanıcı yok", LOCKED: "Hesap kilitli", SUSPENDED: "Firma askıda", INACTIVE: "Kullanıcı kapalı" };
export const END_LABEL: Record<string, string> = { LOGOUT: "Çıkış yaptı", ADMIN: "Yönetici kapattı", PASSWORD_CHANGE: "Şifre değişti", DEACTIVATED: "Kullanıcı kapatıldı", OTHER_SESSIONS: "Diğer oturumlar kapatıldı" };
/** Bu süre boyunca nabız gelmezse oturum "ayrıldı" sayılır */
export const IDLE_MS = 15 * 60_000;

export async function logLogin(p: { sessionId: string; userId: string; username: string; ip: string | null; userAgent: string | null }) {
  await db.insert(s.sessionLogs).values({ ...p, success: true });
}
export async function logFailedLogin(username: string, reason: FailReason, userId: string | null, ip: string | null, userAgent: string | null) {
  await db.insert(s.sessionLogs).values({ username: username.slice(0, 120), userId, success: false, failReason: reason, ip, userAgent, logoutAt: new Date() });
}
/** Oturum(lar) bittiğinde kaydı kapat */
export async function endLogs(sessionIds: string[], reason: string) {
  if (!sessionIds.length) return;
  await db.update(s.sessionLogs).set({ logoutAt: new Date(), endReason: reason }).where(and(inArray(s.sessionLogs.sessionId, sessionIds), isNull(s.sessionLogs.logoutAt)));
}
export async function endUserLogs(userId: string, reason: string, exceptSessionId?: string) {
  const rows = await db.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.userId, userId));
  await endLogs(rows.map((r) => r.id).filter((x) => x !== exceptSessionId), reason);
}

/** Tarayıcı ayrıntısını okunur hale getir: "Chrome 141 · Windows" */
export function deviceLabel(ua: string | null | undefined) {
  if (!ua) return "—";
  const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` : /OPR\/(\d+)/.exec(ua) ? "Opera" : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : ua.includes("Playwright") || ua.includes("Headless") ? "Otomasyon" : "Tarayıcı";
  const o = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const m = /Mobile|iPhone|Android/.test(ua) ? " · mobil" : "";
  return `${b}${o ? ` · ${o}` : ""}${m}`;
}
export function fmtDur(sec: number) {
  if (!sec || sec < 60) return sec > 0 ? `${Math.round(sec)} sn` : "—";
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} sa ${m} dk` : `${m} dk`;
}
