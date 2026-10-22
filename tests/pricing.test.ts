import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { parse, evaluate, FormulaError } from "@/lib/pricing/formula";
import { validatePriceList, evaluateItem, convert, dependents, type PriceItem } from "@/lib/pricing/pricelist";

const ev = (f: string, vars: Record<string, number> = {}, refs: Record<string, number> = {}) =>
  evaluate(parse(f), { vars, ref: (c) => { if (!(c in refs)) throw new FormulaError(`[${c}] yok`); return new Decimal(refs[c]); } }).toString();

describe("Formül dili", () => {
  it("birim fiyatın %30'u — iki yazım", () => {
    expect(ev("[200.001] * %30", {}, { "200.001": 1000 })).toBe("300");
    expect(ev("[200.001] * 30%", {}, { "200.001": 1000 })).toBe("300");
  });
  it("işlem önceliği ve parantez", () => expect(ev("2 + 3 * 4 - (10 / 4)")).toBe("11.5"));
  it("GT blok formülü", () => expect(ev("[240.001] + BLOK * [240.002]", { BLOK: 8 }, { "240.001": 373, "240.002": 70 })).toBe("933"));
  it("EGER ve karşılaştırma", () => {
    expect(ev("EGER(GT > 50000; 2; 1)", { GT: 60000 })).toBe("2");
    expect(ev("EĞER(GT >= 50000; 2; 1)", { GT: 10000 })).toBe("1");
  });
  it("KADEME (çeki gücü)", () => {
    const f = "KADEME(CEKI; 16; 400; 30; 600; 45; 750; 60; 1000; 80; 1250)";
    expect(ev(f, { CEKI: 50 })).toBe("750");
    expect(ev(f, { CEKI: 30 })).toBe("600");
    expect(ev(f, { CEKI: 95 })).toBe("1250");
    expect(() => ev(f, { CEKI: 10 })).toThrow(/ilk eşiğin altında/);
  });
  it("MIN/MAX/YUVARLA ve virgül ayırıcı", () => {
    expect(ev("MIN(GT, 120000)", { GT: 150000 })).toBe("120000");
    expect(ev("YUVARLA(10 / 3; 2)")).toBe("3.33");
    expect(ev("YUKARIYUVARLA(1.01) + ASAGIYUVARLA(1.99)")).toBe("3");
  });
  it("hatalar konumlu ve anlaşılır", () => {
    expect(() => parse("[20.1] * 2")).toThrow(/Geçersiz kalem kodu/);
    expect(() => parse("FOO + 1")).toThrow(/Bilinmeyen değişken FOO/);
    expect(() => parse("(1 + 2")).toThrow(/bekleniyordu/);
    expect(() => parse("1 + ")).toThrow();
    expect(() => ev("1 / 0")).toThrow(/Sıfıra bölme/);
    expect(() => ev("GT * 2", {})).toThrow(/GT değeri bilinmiyor/);
  });
  it("eval yok: kod enjeksiyonu sözdizimi hatasıdır", () => expect(() => parse("process.exit()")).toThrow());
});

const list: PriceItem[] = [
  { code: "200.001", name: "Römorkör taban", unit: "Manevra", currency: "USD", price: "373" },
  { code: "200.002", name: "Römorkör +1000 GT", unit: "Blok", currency: "USD", price: "70" },
  { code: "200.010", name: "Römorkör hizmeti", unit: "Manevra", currency: "USD", formula: "[200.001] + BLOK * [200.002]" },
  { code: "900.001", name: "Gece hazır bulunma (TL)", unit: "Saat", currency: "TRY", price: "2500" },
  { code: "900.002", name: "Römorkör tabanının %30'u (TL)", unit: "Adet", currency: "TRY", formula: "[200.001] * %30" },
];
const fx = { USD: { rate: "49.6015", date: "2026-10-21", source: "TCMB 2026/199" }, EUR: { rate: "55.6781", date: "2026-10-21", source: "TCMB 2026/199" } };

describe("Fiyat listesi", () => {
  it("geçerli liste", () => expect(validatePriceList(list)).toEqual([]));
  it("hatalı kod, tekrar, fiyat+formül, olmayan kalem, döngü", () => {
    const bad: PriceItem[] = [
      { code: "20.1", name: "x", unit: "A", currency: "TRY", price: "1" },
      { code: "300.001", name: "a", unit: "A", currency: "TRY", price: "1", formula: "2" },
      { code: "300.002", name: "b", unit: "A", currency: "TRY", formula: "[300.003] + [999.999]" },
      { code: "300.003", name: "c", unit: "A", currency: "TRY", formula: "[300.002] * 2" },
      { code: "300.003", name: "d", unit: "A", currency: "TRY", price: "5" },
    ];
    const msgs = validatePriceList(bad).map((i) => `${i.code}: ${i.message}`).join("\n");
    expect(msgs).toMatch(/20\.1: Kod biçimi/);
    expect(msgs).toMatch(/300\.001: Sabit fiyat veya formülden yalnız biri/);
    expect(msgs).toMatch(/\[999\.999\] kalemi listede yok/);
    expect(msgs).toMatch(/Döngüsel başvuru/);
    expect(msgs).toMatch(/300\.003: Kod tekrar ediyor/);
  });
  it("USD kalem formülü", () => expect(evaluateItem(list, "200.010", { BLOK: 8 }, fx).value.toString()).toBe("933"));
  it("TL kalem USD kaleme başvurunca güncel kurla çevrilir", () => {
    // 373 × 0,30 = 111,9 USD → × 49,6015 = 5550,40785 TL
    const r = evaluateItem(list, "900.002", {}, fx);
    expect(r.currency).toBe("TRY");
    expect(r.value.toString()).toBe("5550.40785");
    expect(r.trace[0]).toMatch(/USD → .* TRY/);
  });
  it("kur yoksa çevrim yapılmaz, hata verir", () => expect(() => evaluateItem(list, "900.002", {}, {})).toThrow(/USD\/TRY kuru yok/));
  it("çapraz kur EUR→USD (TL üzerinden)", () => expect(convert(new Decimal(100), "EUR", "USD", fx).toDecimalPlaces(4).toString()).toBe("112.2508"));
  it("bağımlı kalemler", () => expect(dependents(list, "200.001").sort()).toEqual(["200.010", "900.002"]));
});

import { parseTcmbXml } from "@/lib/fx";
describe("TCMB XML", () => {
  it("bülten tarihi, numarası ve kurlar", () => {
    const xml = `<?xml version="1.0"?><Tarih_Date Tarih="21.10.2026" Date="10/21/2026" Bulten_No="2026/199"><Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>49.5123</ForexBuying><ForexSelling>49.6015</ForexSelling></Currency><Currency CrossOrder="12" Kod="JPY" CurrencyCode="JPY"><Unit>100</Unit><ForexBuying>32.1</ForexBuying><ForexSelling>32.3</ForexSelling></Currency></Tarih_Date>`;
    const p = parseTcmbXml(xml);
    expect(p.bulletinDate).toBe("2026-10-21");
    expect(p.bulletinNo).toBe("2026/199");
    expect(p.rates[0]).toEqual({ currency: "USD", unit: 1, forexBuying: "49.5123", forexSelling: "49.6015" });
    expect(p.rates[1].unit).toBe(100);
  });
});
