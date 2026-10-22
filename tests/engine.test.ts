/**
 * Referans test seti — beklenen sonuçlar elle hesaplanmıştır (ÖRNEK tarife değerleriyle),
 * motorun kendi çıktısından türetilmemiştir.
 */
import { describe, it, expect } from "vitest";
import { calculate, selectTariffVersion, billedHours, TariffSelectionError } from "@/lib/tariff/engine";
import { actualDuration } from "@/lib/durations";
import { canTransition, OP_STATUS_TRANSITIONS, ACCRUAL_TRANSITIONS } from "@/lib/workflow";
import { DEMO_TARIFF, RULES } from "@/data/catalog";
import type { CalcInput } from "@/lib/tariff/types";

const statuses = Object.fromEntries(RULES.map((r) => [r.code, r.status]));
const base: CalcInput = {
  operationRef: "OP-2026-000001", serviceKind: "PILOTAGE", serviceDate: "2026-10-22T11:30:00Z",
  gt: 1000, allocatedUnits: 1, requestedUnits: 1, extraUnitsWrittenRequest: false, conditionCodes: [], completion: "COMPLETED",
};

describe("Tarife sürüm seçimi (R-009)", () => {
  it("hizmet tarihine göre sürüm seçer", () => {
    expect(selectTariffVersion([DEMO_TARIFF], "2026-10-22T00:00:00Z").id).toBe("demo-krp-2026");
  });
  it("kapsam dışı tarihte hata verir", () => {
    expect(() => selectTariffVersion([DEMO_TARIFF], "2026-01-15T00:00:00Z")).toThrow(TariffSelectionError);
  });
  it("31.01.2027 23:59 TR saati dahil", () => {
    expect(selectTariffVersion([DEMO_TARIFF], "2027-01-31T20:59:00Z").id).toBe("demo-krp-2026");
  });
});

describe("GT sınırları", () => {
  it("1000 GT → ilk kademe 100", () => expect(calculate(base, DEMO_TARIFF).netAmount).toBe("100.00"));
  it("1001 GT → 100 + 1 blok 40 = 140", () => expect(calculate({ ...base, gt: 1001 }, DEMO_TARIFF).netAmount).toBe("140.00"));
  it("2001 GT → 100 + 2 blok = 180", () => expect(calculate({ ...base, gt: 2001 }, DEMO_TARIFF).netAmount).toBe("180.00"));
  it("GT bilinmiyorsa sıfır kabul etmez, eksik bildirir", () => {
    const r = calculate({ ...base, gt: null }, DEMO_TARIFF);
    expect(r.missing).toContain("Doğrulanmış GT değeri yok");
    expect(r.productionEligible).toBe(false);
  });
});

describe("Süre ve yuvarlama (R-015)", () => {
  it("61 dakika → 2 saat ücret, gerçek süre korunur", () => {
    const r = calculate({ ...base, serviceKind: "TOWAGE", gt: 1500, measuredMinutes: 61 }, DEMO_TARIFF);
    expect(r.billedQuantity).toBe("2");
    expect(r.measuredQuantity).toBe("1.0167");
    expect(r.netAmount).toBe("600.00");
  });
  it("tam 60 dk → 1 saat", () => expect(billedHours(60, { mode: "CEIL_HOUR", minimumHours: 1 }).toString()).toBe("1"));
  it("0 dk → asgari 1 saat", () => expect(billedHours(0, { mode: "CEIL_HOUR", minimumHours: 1 }).toString()).toBe("1"));
});

describe("Römorkör sayısı (R-004, R-019)", () => {
  const tow: CalcInput = { ...base, serviceKind: "TOWAGE", gt: 1500, measuredMinutes: 45, requestedUnits: 1, allocatedUnits: 2 };
  it("yazılı talep yoksa ilave römorkör ücretlenmez", () => {
    const r = calculate(tow, DEMO_TARIFF);
    expect(r.billedUnits).toBe(1);
    expect(r.netAmount).toBe("300.00");
    expect(r.rules.find((x) => x.ruleCode === "R-004")?.applied).toBe(false);
  });
  it("kaptanın yazılı talebiyle ücretlenir", () => {
    const r = calculate({ ...tow, extraUnitsWrittenRequest: true }, DEMO_TARIFF);
    expect(r.billedUnits).toBe(2);
    expect(r.netAmount).toBe("600.00");
  });
});

describe("Artırım / indirim (R-005, R-006)", () => {
  it("makinesiz çekilme kılavuzluğa uygulanmaz", () => {
    const r = calculate({ ...base, conditionCodes: ["NO_ENGINE"] }, DEMO_TARIFF);
    expect(r.netAmount).toBe("100.00");
    expect(r.rules.some((x) => x.ruleCode === "R-006" && !x.applied)).toBe(true);
  });
  it("makinesiz çekilme römorkörcülükte %50", () => {
    const r = calculate({ ...base, serviceKind: "TOWAGE", gt: 1500, measuredMinutes: 60, conditionCodes: ["NO_ENGINE"] }, DEMO_TARIFF);
    expect(r.netAmount).toBe("450.00");
  });
  it("iki artırımdan en yükseği", () => {
    const r = calculate({ ...base, serviceKind: "TOWAGE", gt: 1500, measuredMinutes: 60, conditionCodes: ["NO_ENGINE", "DANGEROUS_CARGO"] }, DEMO_TARIFF);
    expect(r.adjustmentRate).toBe("0.5");
  });
  it("artırım + indirim → oran farkı (%50 − %50 = 0)", () => {
    const r = calculate({ ...base, serviceKind: "TOWAGE", gt: 1500, measuredMinutes: 60, conditionCodes: ["NO_ENGINE", "REPAIR_YARD", "CABOTAGE"] }, DEMO_TARIFF);
    expect(r.adjustmentRate).toBe("0");
    expect(r.netAmount).toBe("300.00");
  });
});

describe("Tamamlanma (R-002, R-003, R-008)", () => {
  it("gemi kaynaklı tamamlanamama → yarım ücret", () =>
    expect(calculate({ ...base, completion: "INCOMPLETE_STARTED_VESSEL_OR_FACILITY_CAUSE" }, DEMO_TARIFF).netAmount).toBe("50.00"));
  it("başlamadan iptal → 0", () =>
    expect(calculate({ ...base, completion: "CANCELLED_BEFORE_START" }, DEMO_TARIFF).netAmount).toBe("0.00"));
  it("bekleme kaydedilir, ücretlendirilmez", () => {
    const r = calculate({ ...base, waitingMinutes: 40 }, DEMO_TARIFF);
    expect(r.netAmount).toBe("100.00");
    expect(r.rules.find((x) => x.ruleCode === "R-003")?.applied).toBe(false);
  });
});

describe("Üretim uygunluğu ve determinizm", () => {
  it("ÖRNEK/onaysız tarife üretim tahakkuku üretemez", () => {
    const r = calculate(base, DEMO_TARIFF, statuses);
    expect(r.productionEligible).toBe(false);
    expect(r.productionBlockers.join(" ")).toMatch(/ÖRNEK/);
  });
  it("aynı girdi → aynı doğrulama kimliği", () => {
    expect(calculate(base, DEMO_TARIFF).calcId).toBe(calculate({ ...base }, DEMO_TARIFF).calcId);
  });
  it("onaylı sürüm + onaylı kurallar → üretime uygun", () => {
    const approved = { ...DEMO_TARIFF, isDemo: false, status: "APPROVED" as const };
    const fx = { USD: { rate: "49.6015", date: "2026-10-21", source: "TCMB 2026/199" } };
    const r = calculate({ ...base, fx }, approved, { "R-001": "APPROVED", "R-009": "APPROVED" });
    expect(r.productionEligible).toBe(true);
    expect(r.operational?.amount).toBe("4960.15"); // 100 USD × 49,6015
  });
  it("kur yoksa TL karşılığı varsayılmaz ve üretime geçmez", () => {
    const approved = { ...DEMO_TARIFF, isDemo: false, status: "APPROVED" as const };
    const r = calculate(base, approved, { "R-001": "APPROVED", "R-009": "APPROVED" });
    expect(r.operational).toBeNull();
    expect(r.productionBlockers.join(" ")).toMatch(/USD\/TRY kuru yok/);
  });
});

describe("Gerçek süre (R-001)", () => {
  const ev = [
    { id: "a", type: "TRANSIT_START", occurredAt: "2026-10-22T21:00:00Z" },
    { id: "b", type: "TUG_ALONGSIDE", occurredAt: "2026-10-22T21:40:00Z", serviceKind: "TOWAGE" },
    { id: "c", type: "PAUSE_START", occurredAt: "2026-10-22T22:00:00Z" },
    { id: "d", type: "PAUSE_END", occurredAt: "2026-10-22T22:15:00Z" },
    { id: "e", type: "SERVICE_END", occurredAt: "2026-10-23T00:10:00Z", serviceKind: "TOWAGE" },
  ];
  it("gece yarısını aşan görev doğru hesaplanır; intikal hizmet süresine girmez", () => {
    const d = actualDuration(ev, "TOWAGE");
    expect(d.grossMinutes).toBe(150);
    expect(d.pauseMinutes).toBe(15);
  });
  it("düzeltilen olay hesaba girmez ama silinmez", () => {
    const fix = [...ev, { id: "f", type: "TUG_ALONGSIDE", occurredAt: "2026-10-22T21:50:00Z", serviceKind: "TOWAGE", supersedesId: "b" }];
    expect(actualDuration(fix, "TOWAGE").grossMinutes).toBe(140);
  });
});

describe("İş akışı yetkileri", () => {
  it("beyan kontrolü olmadan hizmet başlatılamaz", () => {
    expect(canTransition(OP_STATUS_TRANSITIONS, "ON_SITE", "STARTED", ["TUG_MASTER"]).ok).toBe(false);
  });
  it("muhasebe tahakkuk onaylayamaz (görev ayrılığı)", () => {
    expect(canTransition(ACCRUAL_TRANSITIONS, "IN_REVIEW", "APPROVED", ["ACCOUNTING"], { productionEligible: true }).ok).toBe(false);
  });
  it("iptal neden kodu ister", () => {
    expect(canTransition(OP_STATUS_TRANSITIONS, "READY", "CANCELLED", ["OPERATIONS_MANAGER"]).ok).toBe(false);
  });
});

describe("Emniyet römorkörü (R-032)", () => {
  it("tarifede kalemi yoksa tarife dışı özel iş olarak işaretlenir, sıfır fiyat üretilmez", async () => {
    const { resolveService } = await import("@/lib/tariff/engine");
    const r = resolveService({ id: "x", label: "x", currency: "TRY", definition: { services: {} } } as never, "STANDBY_TUG");
    expect(r.svc).toBeUndefined();
    expect(r.error).toMatch(/tarife dışı özel iş/);
    expect(r.error).toMatch(/R-032/);
  });
});
