/**
 * Oturum nabzı: tarayıcı sekme görünürken dakikada bir ve sayfa değişiminde çağırır.
 * Aktif süre ve sayfa gezintisi oturum kaydına işlenir. Gövde: { path, active (sn), nav (yeni sayfa mı) }
 */
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentSessionId, currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  const sid = await currentSessionId();
  let b: { path?: string; active?: number; nav?: boolean } = {};
  try { b = JSON.parse(await req.text()); } catch { /* boş gövde */ }
  const path = String(b.path ?? "").slice(0, 200) || null;
  const active = Math.max(0, Math.min(150, Math.round(Number(b.active) || 0))); // tek nabızda en çok 150 sn sayılır
  let [log] = await db.select().from(s.sessionLogs).where(eq(s.sessionLogs.sessionId, sid ?? "")).orderBy(desc(s.sessionLogs.loginAt)).limit(1);
  if (!log) [log] = await db.insert(s.sessionLogs).values({ sessionId: sid, userId: u.id, username: u.username ?? u.email }).returning(); // sürüm öncesi açılmış oturum
  const now = new Date();
  // aktif süre önceki sayfaya yazılır
  if (active > 0) {
    const [pv] = await db.select({ id: s.pageViews.id }).from(s.pageViews).where(eq(s.pageViews.logId, log.id)).orderBy(desc(s.pageViews.at)).limit(1);
    if (pv) await db.update(s.pageViews).set({ seconds: sql`${s.pageViews.seconds} + ${active}` }).where(eq(s.pageViews.id, pv.id));
  }
  const isNav = !!b.nav && !!path && path !== log.lastPath;
  if (isNav) await db.insert(s.pageViews).values({ logId: log.id, userId: u.id, path: path!, at: now });
  await db.update(s.sessionLogs).set({
    lastSeenAt: now, activeSeconds: sql`${s.sessionLogs.activeSeconds} + ${active}`,
    ...(isNav ? { pageViews: sql`${s.sessionLogs.pageViews} + 1`, lastPath: path } : {}),
  }).where(and(eq(s.sessionLogs.id, log.id)));
  return NextResponse.json({ ok: true });
}
