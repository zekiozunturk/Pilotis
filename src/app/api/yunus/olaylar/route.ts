/** Yunus'un duyuracağı yeni görev başlangıç/bitiş olayları (yalnız yöneticiler ve sistem yöneticisi) */
import { NextResponse } from "next/server";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentUser } from "@/lib/session";
import { opSpeech } from "@/lib/op-notify";

const ANNOUNCE_ROLES = ["OPERATIONS_MANAGER", "BUSINESS_MANAGER", "SYSTEM_ADMIN"];
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ events: [] }, { status: 401 });
  const now = new Date();
  if (!u.roles.some((r) => ANNOUNCE_ROLES.includes(r))) return NextResponse.json({ events: [], now });
  const after = new URL(req.url).searchParams.get("after");
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(Math.max(Date.parse(after) + 1, now.getTime() - 10 * 60_000)) /* +1 ms: veritabanı mikro saniye tutar */ : now;
  const rows = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, u.id), inArray(s.notifications.kind, ["OP_STARTED", "OP_ENDED"]), gt(s.notifications.createdAt, since))).orderBy(asc(s.notifications.createdAt)).limit(5);
  const events = await Promise.all(rows.map(async (n) => {
    const ref = n.link?.split("/").pop() ?? "";
    const speech = n.title.startsWith("[Deneme]") ? `Deneme. ${await opSpeech(ref, n.kind as "OP_STARTED", n.title)}` : await opSpeech(ref, n.kind as "OP_STARTED", n.title);
    return { id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, at: n.createdAt, speech };
  }));
  return NextResponse.json({ events, now: rows.at(-1)?.createdAt ?? now });
}
