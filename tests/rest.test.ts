import { describe, it, expect } from "vitest";
import { evaluate, whatIf, type Interval } from "@/lib/planning/rest";
import { PROFILES } from "@/lib/planning/profiles";

const STCW = PROFILES[0], ISK = PROFILES[1];
const t = (s: string) => new Date(`${s}:00+03:00`).getTime();
const iv = (a: string, b: string, category: Interval["category"] = "WORK", label = `${a}–${b}`): Interval => ({ start: t(a), end: t(b), category, label });
const from = t("2026-10-19T00:00"), to = t("2026-10-26T00:00"); // pazartesi–pazar

describe("STCW/MLC dinlenme", () => {
  it("08–17 günlük düzen uyumlu", () => {
    const xs = ["19", "20", "21", "22", "23"].map((d) => iv(`2026-10-${d}T08:00`, `2026-10-${d}T17:00`));
    const r = evaluate(xs, STCW, from, to);
    expect(r.violations.filter((v) => v.severity === "ERROR")).toEqual([]);
    expect(r.metrics.workMinutes).toBe(45 * 60);
    expect(r.metrics.minRest24h).toBe(15 * 60);
  });
  it("kayan pencere: takvim günü uyumlu görünse de 24 saatte 10 saatten az dinlenme yakalanır", () => {
    // Pzt 06–18 ve Sal 02–10: takvim günlerinde 12 ve 8 saat; kayan pencerede (Pzt 10:00–Sal 10:00) 16 saat çalışma → 8 saat dinlenme
    const r = evaluate([iv("2026-10-19T06:00", "2026-10-19T18:00"), iv("2026-10-20T02:00", "2026-10-20T10:00")], STCW, from, to);
    expect(r.violations.map((v) => v.code)).toContain("REST_24H");
    expect(r.metrics.minRest24h).toBe(8 * 60);
  });
  it("dinlenme 3 parçaya bölünürse (en uzunu < 6 saat) ihlal", () => {
    const xs = [iv("2026-10-19T04:00", "2026-10-19T08:00"), iv("2026-10-19T12:00", "2026-10-19T16:00"), iv("2026-10-19T20:00", "2026-10-19T22:00")];
    expect(evaluate(xs, STCW, from, to).violations.map((v) => v.code)).toContain("REST_SPLIT");
  });
  it("14 saatten uzun kesintisiz çalışma ihlal; 45 dk ara dinlenme sayılmaz", () => {
    const xs = [iv("2026-10-19T06:00", "2026-10-19T14:00"), iv("2026-10-19T14:45", "2026-10-19T21:30")];
    const r = evaluate(xs, STCW, from, to);
    expect(r.violations.map((v) => v.code)).toContain("CONTINUOUS_WORK");
    expect(r.metrics.longestContinuousWork).toBe(15.5 * 60);
  });
  it("7 günde 77 saatten az dinlenme", () => {
    const xs = ["19", "20", "21", "22", "23", "24", "25"].map((d) => iv(`2026-10-${d}T06:00`, `2026-10-${d}T20:00`));
    const r = evaluate(xs, STCW, from, to);
    expect(r.violations.map((v) => v.code)).toContain("REST_7D");
    expect(r.metrics.minRest7d).toBe(70 * 60);
  });
  it("hazır bulunma profile göre çalışma sayılır", () => {
    const r1 = evaluate([iv("2026-10-19T08:00", "2026-10-19T20:00", "STANDBY")], STCW, from, to);
    const r2 = evaluate([iv("2026-10-19T08:00", "2026-10-19T20:00", "STANDBY")], { ...STCW, standbyCountsAsWork: false }, from, to);
    expect(r1.metrics.workMinutes).toBe(720);
    expect(r2.metrics.workMinutes).toBe(0);
  });
});

describe("Gece, hafta, çakışma", () => {
  it("gece görevi sayımı ve gece saatleri (gece yarısını aşan)", () => {
    const r = evaluate([iv("2026-10-19T22:00", "2026-10-20T06:00")], STCW, from, to);
    expect(r.metrics.nightMinutes).toBe(8 * 60);
    expect(r.metrics.nightShifts).toBe(1);
  });
  it("İş Kanunu: gece 7,5 saati aşamaz", () => {
    expect(evaluate([iv("2026-10-19T20:00", "2026-10-20T04:00")], ISK, from, to).violations.map((v) => v.code)).toContain("NIGHT_WORK");
  });
  it("İş Kanunu: 45 saati aşan fazla mesai uyarı, 11 saati aşan gün hata", () => {
    const xs = ["19", "20", "21", "22"].map((d) => iv(`2026-10-${d}T07:00`, `2026-10-${d}T19:00`));
    const codes = evaluate(xs, ISK, from, to).violations.map((v) => `${v.code}:${v.severity}`);
    expect(codes).toContain("OVERTIME:WARNING");
    expect(codes).toContain("WORK_24H:ERROR");
  });
  it("İş Kanunu: 7 günde 24 saat kesintisiz dinlenme yoksa hata", () => {
    const xs = ["19", "20", "21", "22", "23", "24", "25"].map((d) => iv(`2026-10-${d}T08:00`, `2026-10-${d}T16:00`));
    expect(evaluate(xs, ISK, from, to).violations.map((v) => v.code)).toContain("WEEKLY_REST");
  });
  it("çakışan kayıtlar ve izinde görev", () => {
    const codes = evaluate([iv("2026-10-19T08:00", "2026-10-19T12:00"), iv("2026-10-19T11:00", "2026-10-19T13:00"), iv("2026-10-21T00:00", "2026-10-22T00:00", "LEAVE"), iv("2026-10-21T09:00", "2026-10-21T10:00")], STCW, from, to).violations.map((v) => v.code);
    expect(codes).toContain("OVERLAP");
    expect(codes).toContain("ON_LEAVE");
  });
});

describe("Ne olur analizi", () => {
  it("yeni kayıt dinlenmeyi bozuyorsa yeni ihlal döner; eski ihlal yenisini gizlemez", () => {
    const existing = [iv("2026-10-19T06:00", "2026-10-19T18:00"), iv("2026-10-20T02:00", "2026-10-20T10:00"), // eski ihlal (pzt-sal)
      iv("2026-10-23T08:00", "2026-10-23T17:00")];
    const add = iv("2026-10-23T22:00", "2026-10-24T06:00", "WORK", "gece görevi");
    const r = whatIf(existing, add, STCW, from, to);
    expect(r.newViolations.map((v) => v.code)).toContain("REST_24H");
    expect(r.newViolations.every((v) => (v.windowStart ?? 0) >= t("2026-10-22T00:00"))).toBe(true);
  });
  it("uyumlu ekleme yeni ihlal üretmez", () => {
    const r = whatIf([iv("2026-10-19T08:00", "2026-10-19T17:00")], iv("2026-10-20T08:00", "2026-10-20T17:00"), STCW, from, to);
    expect(r.newViolations).toEqual([]);
  });
});
