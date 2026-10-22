"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/session";
export async function markAllRead() {
  const u = await requireUser();
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, u.id), isNull(s.notifications.readAt)));
  revalidatePath("/", "layout");
}
