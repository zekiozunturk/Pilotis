import { describe, it, expect } from "vitest";
import { calculate, selectTariffVersion } from "@/lib/tariff/engine";
import { categorize } from "@/lib/tariff/category";
import { holidayAt } from "@/data/holidays";
import { KRP_PETKIM_REV4 } from "@/data/tariffs/krp-petkim-rev4";
import { REFERENCE_CASES } from "@/data/reference-cases";
import { DEMO_TARIFF } from "@/data/catalog";

describe("Referans test seti (elle hesaplanmış beklenen değerler)", () => {
  for (const rc of REFERENCE_CASES) {
    it(`${rc.code} ${rc.title} = ${rc.expected}`, () => {
      const r = calculate({ operationRef: rc.code, ...rc.input }, KRP_PETKIM_REV4);
      expect(r.missing).toEqual([]);
      expect(r.netAmount).toBe(rc.expected);
    });
  }
  it("kaynaklı ama onaysız sürüm üretime geçemez", () => {
    const r = calculate({ operationRef: "X", ...REFERENCE_CASES[0].input }, KRP_PETKIM_REV4);
    expect(r.productionEligible).toBe(false);
    expect(r.productionBlockers.join(" ")).toMatch(/SOURCE_FOUND|doğrulama notu/);
  });
  it("kategorili sürümde kategori zorunlu", () => {
    const r = calculate({ operationRef: "X", ...REFERENCE_CASES[0].input, tariffCategory: null }, KRP_PETKIM_REV4);
    expect(r.missing).toContain("Tarife kategorisi belirlenmedi");
  });
  it("standby römorkör çeki gücü olmadan hesaplanmaz", () => {
    const r = calculate({ operationRef: "X", ...REFERENCE_CASES[10].input, bollardPullT: null }, KRP_PETKIM_REV4);
    expect(r.missing[0]).toMatch(/çeki gücü/);
  });
});

describe("Kategori seçimi gerekçeli", () => {
  it("kabotaj önceliklidir", () => expect(categorize({ vesselType: "Ro-Ro", isCabotage: true }).code).toBe("KABOTAJ"));
  it("liner olmayan konteyner → diğer yük", () => expect(categorize({ vesselType: "Container Ship", isCabotage: false, isLinerService: false }).code).toBe("DIGER_YUK"));
  it("liner konteyner", () => expect(categorize({ vesselType: "Container Ship", isCabotage: false, isLinerService: true }).code).toBe("LINER_KONTEYNER"));
  it("kabotaj bilinmiyorsa varsayım olarak işaretlenir", () => expect(categorize({ vesselType: "General Cargo" }).assumed).toBe(true));
});

describe("Bayram takvimi (Europe/Istanbul)", () => {
  it("29 Ekim tam gün", () => expect(holidayAt("2026-10-29T05:00:00Z")?.name).toMatch(/Cumhuriyet/));
  it("28 Ekim 13:00 öncesi tatil değil", () => expect(holidayAt("2026-10-28T09:00:00Z")).toBeNull());
  it("28 Ekim 13:00 sonrası tatil", () => expect(holidayAt("2026-10-28T10:30:00Z")).not.toBeNull());
  it("UTC 31 Ara 22:00 = TR 1 Ocak", () => expect(holidayAt("2025-12-31T22:00:00Z")?.name).toBe("Yılbaşı"));
});

describe("Sürüm seçimi önceliği", () => {
  it("aynı dönemde statüsü ileri olan seçilir", () => {
    const approved = { ...DEMO_TARIFF, id: "x", status: "APPROVED" as const, isDemo: false };
    expect(selectTariffVersion([DEMO_TARIFF, approved], "2026-10-22T00:00:00Z").id).toBe("x");
  });
  it("aynı statüde çakışma hata verir", () => {
    expect(() => selectTariffVersion([DEMO_TARIFF, { ...DEMO_TARIFF, id: "y" }], "2026-10-22T00:00:00Z")).toThrow(/çakışıyor/);
  });
});
