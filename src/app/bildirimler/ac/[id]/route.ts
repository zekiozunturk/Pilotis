import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/session";
/** Bildirimi okundu işaretleyip bağlantısına yönlendirir (yalnız kendi bildirimi) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const [n] = await db.select().from(s.notifications).where(and(eq(s.notifications.id, id), eq(s.notifications.userId, u.id)));
  if (!n) return NextResponse.redirect(new URL("/bildirimler", req.url));
  if (!n.readAt) await db.update(s.notifications).set({ readAt: new Date() }).where(eq(s.notifications.id, id));
  return NextResponse.redirect(new URL(n.link && n.link.startsWith("/") ? n.link : "/bildirimler", req.url));
}
