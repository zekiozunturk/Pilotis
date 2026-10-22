import { describe, it, expect } from "vitest";
import { parseNumber, parseDate, parseBool, asText, parseCsv, fromExcel, imoValid, vknValid, normHeader } from "@/lib/exchange/parse";
const ok = <T,>(r: { ok: boolean }) => (r as { ok: true; value: T }).value;

describe("Excel değer çözümleme", () => {
  it("Türkçe/İngilizce sayılar ve para birimi", () => {
    expect(ok<{ n: number }>(parseNumber("1.234,56")).n).toBe(1234.56);
    expect(ok<{ n: number }>(parseNumber("1,234.56")).n).toBe(1234.56);
    expect(ok<{ n: number }>(parseNumber("1 250,5")).n).toBe(1250.5);
    expect(ok<{ n: number; currency: string }>(parseNumber("1.250,00 TL"))).toEqual({ n: 1250, currency: "TRY" });
    expect(ok<{ n: number; currency: string }>(parseNumber("USD 1,250.00"))).toEqual({ n: 1250, currency: "USD" });
    expect(ok<{ n: number }>(parseNumber("(150,00)")).n).toBe(-150);
    expect(parseNumber("12a").ok).toBe(false);
    expect(parseNumber("100 USD", "TRY").ok).toBe(false);
    const amb = parseNumber("1.234"); expect(amb.ok && amb.warn).toBeTruthy();
  });
  it("tarihler İstanbul saatine göre", () => {
    expect(ok<number>(parseDate("22.10.2026 14:30"))).toBe(new Date("2026-10-22T14:30:00+03:00").getTime());
    expect(ok<number>(parseDate("2026-10-22"))).toBe(new Date("2026-10-22T00:00:00+03:00").getTime());
    expect(ok<number>(parseDate(new Date(Date.UTC(2026, 9, 22, 14, 30))))).toBe(new Date("2026-10-22T14:30:00+03:00").getTime());
    expect(ok<number>(parseDate(46317))).toBe(new Date("2026-10-22T00:00:00+03:00").getTime()); // Excel seri no
    expect(parseDate("31.02.2026").ok).toBe(false);
    expect(parseDate("10/22/2026").ok).toBe(false); // ay 22 olamaz — ABD biçimi sessizce kabul edilmez
  });
  it("evet/hayır, kimlikte baştaki sıfır, başlık normalleştirme", () => {
    expect(ok<boolean>(parseBool("Evet"))).toBe(true); expect(ok<boolean>(parseBool("hayır"))).toBe(false); expect(parseBool("belki").ok).toBe(false);
    const t = asText(123, { pad: 6 }); expect(t.ok && t.value).toBe("000123"); expect(t.ok && t.warn).toBeTruthy();
    expect(ok<string>(asText("000123"))).toBe("000123");
    expect(normHeader("Vergi No *")).toBe("vergi no"); expect(normHeader("GEMİ ADI")).toBe("gemi adi");
  });
  it("CSV: ayırıcı tespiti, tırnak, BOM", () => {
    const r = parseCsv('﻿Ad;Tutar\n"ÖRNEK; A.Ş.";"1.250,00"\nB;5\n');
    expect(r.length).toBe(3); expect(r[1][0].v).toBe("ÖRNEK; A.Ş."); expect(r[1][1].v).toBe("1.250,00");
    expect(parseCsv("a,b\n1,2").at(-1)!.map((c) => c.v)).toEqual(["1", "2"]);
  });
  it("formül, dış bağlantı ve hata hücreleri", () => {
    expect(fromExcel({ formula: "A1*2", result: 10 })).toEqual({ v: 10, f: "A1*2", ext: false });
    expect(fromExcel({ formula: "[Fiyat.xlsx]Sayfa1!A1", result: 5 }).ext).toBe(true);
    expect(fromExcel({ formula: "1/0", result: { error: "#DIV/0!" } }).err).toBe("#DIV/0!");
    expect(fromExcel({ richText: [{ text: "ÖR" }, { text: "NEK" }] }).v).toBe("ÖRNEK");
  });
  it("IMO ve VKN denetim haneleri", () => {
    expect(imoValid("9074729")).toBe(true); expect(imoValid("9074728")).toBe(false);
    for (const base of ["123456789", "000000001", "987654321"]) expect([...Array(10).keys()].filter((k) => vknValid(base + k)).length).toBe(1); // tek geçerli denetim hanesi
    expect(vknValid("12345")).toBe(false);
  });
});
