/** Bildirim servisi — gerçek veritabanıyla (yerel PostgreSQL). SMTP tanımsızken kuyruk kaybolmaz. */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { notify, flushOutbox } from "@/lib/notify";

describe("bildirim", () => {
  it("rol ve firma kitlesine kutu kaydı + e-posta kuyruğu; tekrar eden alıcı tek kayıt", async () => {
    delete process.env.SMTP_HOST; delete process.env.SMTP_URL;
    const users = await db.select().from(s.users).where(inArray(s.users.username, ["yonetici", "musteri"]));
    if (users.length < 2) return; // tohumlanmamış veritabanı
    const musteri = users.find((u) => u.username === "musteri")!;
    const tag = `TEST-${Date.now()}`;
    const n = await notify({ roles: ["BUSINESS_MANAGER"], partyIds: [musteri.partyId], userIds: [musteri.id] }, { kind: "TEST", title: tag, body: "deneme", ref: tag });
    expect(n).toBeGreaterThanOrEqual(2);
    const inbox = await db.select().from(s.notifications).where(eq(s.notifications.title, tag));
    expect(new Set(inbox.map((x) => x.userId)).size).toBe(inbox.length); // aynı kişiye iki kez yazılmaz
    await flushOutbox();
    const out = await db.select().from(s.outbox).where(and(eq(s.outbox.ref, tag), eq(s.outbox.channel, "EMAIL")));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((o) => o.status === "NO_CONFIG")).toBe(true);
    await db.delete(s.outbox).where(eq(s.outbox.ref, tag));
    await db.delete(s.notifications).where(eq(s.notifications.title, tag));
  });
  it("kitle boşsa hiçbir şey yazılmaz ve hata fırlatılmaz", async () => {
    expect(await notify({ userIds: [] }, { kind: "TEST", title: "x", body: "y" })).toBe(0);
  });
});
