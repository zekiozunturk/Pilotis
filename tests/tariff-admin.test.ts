import { describe, it, expect } from "vitest";
import { deriveByIndex, diffDefinitions, compareMatrix, approvalBlockers, overlaps } from "@/lib/tariff/admin";
import { KRP_PETKIM_REV4 } from "@/data/tariffs/krp-petkim-rev4";

const def = KRP_PETKIM_REV4.definition;

describe("Endeksle türetme", () => {
  it("%2,7 ve kuruş yuvarlaması: 197 → 202,32; 81 → 83,19", () => {
    const d = deriveByIndex(def, "2.7", "CENT", "test");
    const p = (c: string) => d.items!.find((i) => i.code === c)!;
    expect(p("140.001").price).toBe("202.32");   // 197 × 1,027 = 202,319
    expect(p("140.002").price).toBe("83.19");    // 81 × 1,027 = 83,187
    expect(p("140.010").formula).toBe("[140.001] + BLOK * [140.002]"); // formül değişmez
  });
  it("tam sayıya yuvarlama", () => expect(deriveByIndex(def, "2.7", "UNIT", "t").items!.find((i) => i.code === "140.001")!.price).toBe("202"));
  it("TL kalemler ABD TÜFE ile endekslenmez", () => {
    const withTl = { ...def, items: [...def.items!, { code: "900.001", name: "TL kalem", unit: "Adet", currency: "TRY" as const, price: "1000" }] };
    expect(deriveByIndex(withTl, "10", "UNIT", "t").items!.find((i) => i.code === "900.001")!.price).toBe("1000");
  });
  it("artırım/indirim oranları endekslenmez", () => expect(deriveByIndex(def, "10", "CENT", "t").adjustments).toEqual(def.adjustments));
  it("negatif oranda ücretler değişmez", () => expect(deriveByIndex(def, "-1.5", "CENT", "t").items!.find((i) => i.code === "110.001")!.price).toBe("70"));
  it("türetilen sürüme çözülmemiş endeks notu eklenir", () => expect(deriveByIndex(def, "2.7", "CENT", "t").verificationNotes!.at(-1)!.resolved).toBe(false));
  it("standby saatlik ücretler de endekslenir", () => expect(deriveByIndex(def, "10", "UNIT", "t").items!.find((i) => i.code === "500.001")!.price).toBe("440"));
});

describe("Sürüm farkı", () => {
  it("değişen hücreler ve yüzde", () => {
    const d = deriveByIndex(def, "10", "UNIT", "t");
    const diff = diffDefinitions(def, d);
    const c = diff.find((x) => x.path === "item.140.001")!;
    expect([c.from, c.to, c.changePct]).toEqual(["197", "217", "10.15"]);
    expect(diff.some((x) => x.path.startsWith("adj."))).toBe(false);
  });
  it("aynı tanım → fark yok", () => expect(diffDefinitions(def, def)).toHaveLength(0));
  it("karşılaştırma matrisi", () => {
    const v2 = { ...KRP_PETKIM_REV4, id: "v2", definition: deriveByIndex(def, "10", "NONE", "t") };
    const m = compareMatrix(KRP_PETKIM_REV4, v2, "PILOTAGE");
    const row = m.find((x) => x.category === "DIGER_YUK")!.rows.find((r) => r.gt === 1000)!;
    expect([row.a, row.b, row.pct]).toEqual(["197.00", "216.70", "10"]);
  });
});

describe("Onay ön koşulları", () => {
  it("açık not ve eksik vaka engeller", () => {
    const b = approvalBlockers({ definition: def, isDemo: false }, [{ pass: true }]);
    expect(b.join(" ")).toMatch(/doğrulama notu/);
    expect(b.join(" ")).toMatch(/En az 5/);
  });
  it("başarısız vaka engeller", () => {
    const ok = { ...def, verificationNotes: [] };
    expect(approvalBlockers({ definition: ok, isDemo: false }, [...Array(5)].map(() => ({ pass: true })).concat([{ pass: false }]))).toEqual(["1 referans vaka başarısız"]);
  });
  it("koşullar tamamsa engel yok", () => expect(approvalBlockers({ definition: { ...def, verificationNotes: [] }, isDemo: false }, [...Array(5)].map(() => ({ pass: true })))).toEqual([]));
  it("dönem çakışması", () => {
    expect(overlaps({ validFrom: "2026-02-01", validTo: "2027-01-31" }, { validFrom: "2027-01-31", validTo: "2028-01-31" })).toBe(true);
    expect(overlaps({ validFrom: "2026-02-01", validTo: "2027-01-31" }, { validFrom: "2027-02-01", validTo: "2028-01-31" })).toBe(false);
  });
});

import { syncServicesFromItems } from "@/lib/tariff/admin";
import { calculate } from "@/lib/tariff/engine";
describe("Fiyat listesi → hizmet eşlemesi", () => {
  it("mevcut eşleme korunur ve referans sonuç değişmez", () => {
    const { def: d, issues } = syncServicesFromItems(def);
    expect(issues).toEqual([]);
    expect(d.categories!.DIGER_YUK.services.TOWAGE!.itemCode).toBe("240.010");
    const r = calculate({ operationRef: "x", serviceKind: "TOWAGE", serviceDate: "2025-10-22T09:00:00Z", gt: 8450, measuredMinutes: null, allocatedUnits: 1, requestedUnits: 1, extraUnitsWrittenRequest: false, conditionCodes: [], completion: "COMPLETED", tariffCategory: "DIGER_YUK" }, { ...KRP_PETKIM_REV4, definition: d });
    expect(r.netAmount).toBe("933.00");
  });
  it("yeni TL kalem formülle eklenip hizmete bağlanır", () => {
    const items = [...def.items!.filter((i) => i.code !== "240.010"), { code: "240.010", name: "Römorkör (TL, formüllü)", unit: "Römorkör/manevra", currency: "TRY" as const, formula: "([240.001] + BLOK * [240.002]) * 110%", serviceKind: "TOWAGE", category: "DIGER_YUK" }];
    const { def: d } = syncServicesFromItems({ ...def, items });
    const fx = { USD: { rate: "49.6015", date: "2026-10-21", source: "TCMB 2026/199" } };
    const r = calculate({ operationRef: "x", serviceKind: "TOWAGE", serviceDate: "2025-10-22T09:00:00Z", gt: 8450, measuredMinutes: null, allocatedUnits: 1, requestedUnits: 1, extraUnitsWrittenRequest: false, conditionCodes: [], completion: "COMPLETED", tariffCategory: "DIGER_YUK", fx }, { ...KRP_PETKIM_REV4, definition: d });
    // 933 USD × 1,10 = 1026,3 USD → × 49,6015 TL = 50.906,019... TL (kalem TL; çevrim formül içinde)
    expect(r.currency).toBe("TRY");
    expect(r.netAmount).toBe("50906.02");
    expect(r.operational?.amount).toBe("50906.02");
  });
  it("aynı hizmet+kategori için iki kalem hata", () => {
    const items = [...def.items!, { code: "240.011", name: "x", unit: "A", currency: "USD" as const, price: "1", serviceKind: "TOWAGE", category: "DIGER_YUK" }];
    expect(syncServicesFromItems({ ...def, items }).issues[0]).toMatch(/birden fazla/);
  });
});
