import { describe, it, expect } from "vitest";
import { deriveByIndex, diffDefinitions, compareMatrix, approvalBlockers, overlaps } from "@/lib/tariff/admin";
import { KRP_PETKIM_REV4 } from "@/data/tariffs/krp-petkim-rev4";

const def = KRP_PETKIM_REV4.definition;

describe("Endeksle türetme", () => {
  it("%2,7 ve kuruş yuvarlaması: 197 → 202,32; 81 → 83,19", () => {
    const d = deriveByIndex(def, "2.7", "CENT", "test");
    const b = d.categories!.DIGER_YUK.services.PILOTAGE!.bands[0];
    expect(b.base).toBe("202.32");   // 197 × 1,027 = 202,319
    expect(b.perBlock).toBe("83.19"); // 81 × 1,027 = 83,187
  });
  it("tam sayıya yuvarlama", () => expect(deriveByIndex(def, "2.7", "UNIT", "t").categories!.DIGER_YUK.services.PILOTAGE!.bands[0].base).toBe("202"));
  it("artırım/indirim oranları endekslenmez", () => expect(deriveByIndex(def, "10", "CENT", "t").adjustments).toEqual(def.adjustments));
  it("negatif oranda ücretler değişmez", () => expect(deriveByIndex(def, "-1.5", "CENT", "t").categories!.KABOTAJ.services.PILOTAGE!.bands[0].base).toBe("70"));
  it("türetilen sürüme çözülmemiş endeks notu eklenir", () => expect(deriveByIndex(def, "2.7", "CENT", "t").verificationNotes!.at(-1)!.resolved).toBe(false));
  it("standby saatlik ücretler de endekslenir", () => expect(deriveByIndex(def, "10", "UNIT", "t").categories!.DIGER_YUK.services.STANDBY_TUG!.bollardBands![0].rate).toBe("440"));
});

describe("Sürüm farkı", () => {
  it("değişen hücreler ve yüzde", () => {
    const d = deriveByIndex(def, "10", "UNIT", "t");
    const diff = diffDefinitions(def, d);
    const c = diff.find((x) => x.path === "DIGER_YUK.PILOTAGE.b0.base")!;
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
