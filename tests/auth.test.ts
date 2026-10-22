import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hashPassword, verifyPassword, passwordProblem } from "@/lib/password";
import { leadTimeProblem, toLocalInput, earliestAllowed } from "@/lib/lead-time";
import { textHash } from "@/lib/contracts-hash";

describe("şifre", () => {
  it("özet tuzludur ve doğrulanır", () => {
    const a = hashPassword("123456"), b = hashPassword("123456");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("123456", a)).toBe(true);
    expect(verifyPassword("1234567", a)).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "bozuk")).toBe(false);
  });
  it("canlı şifre politikası", () => {
    expect(passwordProblem("123456")).toMatch(/8/);
    expect(passwordProblem("abcdefgh")).toMatch(/rakam/);
    expect(passwordProblem("Liman2026")).toBeNull();
  });
});

describe("asgari bildirim süresi", () => {
  const now = Date.parse("2026-10-22T09:00:00+03:00");
  it("6 saatten yakın talep reddedilir, sınırda kabul edilir", () => {
    expect(leadTimeProblem(new Date(now + 5.9 * 3_600_000), 6, now)).toMatch(/en az 6 saat/);
    expect(leadTimeProblem(new Date(now + 6 * 3_600_000), 6, now)).toBeNull();
    expect(leadTimeProblem(new Date(now - 60_000), 6, now)).toMatch(/geçmişte/);
    expect(leadTimeProblem(new Date("x"), 6, now)).toMatch(/okunamadı/);
  });
  it("hata mesajı en erken zamanı İstanbul saatiyle verir", () => {
    expect(leadTimeProblem(new Date(now + 3_600_000), 6, now)).toContain("15:00");
    expect(toLocalInput(earliestAllowed(6, now))).toBe("2026-10-22T15:00");
  });
});

describe("sözleşme metin özeti", () => {
  it("satır sonu farkı özeti değiştirmez, içerik farkı değiştirir", () => {
    expect(textHash("a\r\nb")).toBe(textHash("a\nb\n"));
    expect(textHash("a\nb")).not.toBe(textHash("a\nc"));
  });
});
