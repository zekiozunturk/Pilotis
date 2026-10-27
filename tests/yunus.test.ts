/** Yunus: görev duyurusu kitlesi, sesli metin, yerleşik bilgi tabanı yanıtları; oturum kaydı yardımcıları */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
import { and, eq, gt, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { notifyOpStarted, notifyOpEnded, opSpeech } from "@/lib/op-notify";
import { answer } from "@/lib/yunus";
import { deviceLabel, fmtDur } from "@/lib/session-log";
import { helpFor, pageTitle } from "@/data/yunus";

describe("görev duyurusu", () => {
  it("başlangıç ve bitiş yalnız yönetici ve sistem yöneticisine gider; sesli metin gemi ve araçları söyler", async () => {
    const [o] = await db.select().from(s.operations).where(eq(s.operations.opStatus, "STARTED")).limit(1);
    if (!o) return; // tohumlanmamış veritabanı
    const t0 = new Date(Date.now() - 1000);
    await notifyOpStarted(o.id);
    await notifyOpEnded(o.id, "COMPLETED", null);
    const rows = await db.select({ kind: s.notifications.kind, u: s.users.username, roles: s.users.roles }).from(s.notifications).innerJoin(s.users, eq(s.users.id, s.notifications.userId))
      .where(and(inArray(s.notifications.kind, ["OP_STARTED", "OP_ENDED"]), gt(s.notifications.createdAt, t0)));
    const who = new Set(rows.map((r) => r.u));
    expect(who.has("yonetici")).toBe(true);
    expect(who.has("admin")).toBe(true);
    for (const x of ["kaptan", "romorkor", "musteri", "muhasebe"]) expect(who.has(x)).toBe(false);
    expect(rows.filter((r) => r.u === "yonetici").map((r) => r.kind).sort()).toEqual(["OP_ENDED", "OP_STARTED"]);
    const sp = await opSpeech(o.ref, "OP_STARTED", "");
    expect(sp).toMatch(/^Dikkat\. .+ gemisinin .+ görevi başladı\./);
    expect(sp).not.toMatch(/-\d/); // "Römork-1" → "Römork 1" (doğru okunsun)
  });
});

describe("Yunus yanıtları (yapay zekâ anahtarı yokken)", () => {
  const u = { id: "x", name: "Deneme", username: "deneme", email: "d@x", roles: ["OPERATIONS_MANAGER"], partyId: null, personnelId: null, title: null, isDemo: true, mustChangePassword: false } as const;
  it("terim, kural ve ekran sorularını yerleşik bilgiden yanıtlar", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const a = await answer("6 saat kuralı nedir?", "/portal", { ...u, roles: [...u.roles] }, "OPERATIONS_MANAGER", false);
    expect(a.source).toBe("local"); expect(a.answer).toMatch(/6 saat/);
    const k = await answer("hangi döviz kuru kullanılıyor", "/", { ...u, roles: [...u.roles] }, "OPERATIONS_MANAGER", false);
    expect(k.answer).toMatch(/TCMB/);
    const p = await answer("bu ekranda ne yapabilirim", "/muhasebe", { ...u, roles: [...u.roles] }, "OPERATIONS_MANAGER", false);
    expect(p.answer).toMatch(/Muhasebe/);
    const [t] = await db.select().from(s.terms).limit(1);
    if (t) { const r = await answer(`${t.tr} nedir`, "/", { ...u, roles: [...u.roles] }, "OPERATIONS_MANAGER", false); expect(r.answer).toContain(t.tr); }
  });
  it("ekran eşleşmesi en uzun yolu seçer; iş emri başlığı", () => {
    expect(helpFor("/portal/belgeler")?.title).toBe("Sözleşme ve onaylar");
    expect(helpFor("/operasyonlar/YP-1")?.title).toBe("Operasyonlar");
    expect(pageTitle("/operasyonlar/YP-26-0001")).toBe("İş emri YP-26-0001");
    expect(pageTitle("/operasyonlar/yeni")).toBe("Yeni talep (masa)");
  });
});

describe("oturum kaydı yardımcıları", () => {
  it("cihaz ve süre biçimi", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("Edge 141 · Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1")).toBe("Safari 18 · iOS · mobil");
    expect(fmtDur(0)).toBe("—"); expect(fmtDur(45)).toBe("45 sn"); expect(fmtDur(600)).toBe("10 dk"); expect(fmtDur(3 * 3600 + 20 * 60)).toBe("3 sa 20 dk");
  });
});
