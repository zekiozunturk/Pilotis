/**
 * REFERANS TEST SETİ — beklenen tutarlar motor çıktısından DEĞİL, kaynak tablodan elle hesaplanmıştır.
 * "working" alanı hesabın açık yazımıdır; kaynak tablo satırlarıyla çapraz kontrol edilenler OFFICIAL_EXAMPLE.
 */
import type { CalcInput } from "@/lib/tariff/types";

export interface ReferenceCase {
  code: string; title: string; versionId: string; source: "INDEPENDENT_MANUAL" | "OFFICIAL_EXAMPLE" | "HISTORICAL_JOB";
  input: Omit<CalcInput, "operationRef">; expected: string; working: string;
}

const base = { serviceDate: "2025-10-22T09:00:00Z", measuredMinutes: null, allocatedUnits: 1, requestedUnits: 1, extraUnitsWrittenRequest: false, conditionCodes: [] as string[], completion: "COMPLETED" as const };
const V = "krp-2025-petkim-rev4";

export const REFERENCE_CASES: ReferenceCase[] = [
  { code: "RC-01", title: "Diğer yük · kılavuzluk · 8.450 GT", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 8450, tariffCategory: "DIGER_YUK" }, expected: "845.00", working: "197 + ⌈7450/1000⌉=8 × 81 = 197 + 648 = 845" },
  { code: "RC-02", title: "Diğer yük · römorkör · 8.450 GT · 1 römorkör", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "TOWAGE", gt: 8450, tariffCategory: "DIGER_YUK" }, expected: "933.00", working: "373 + 8 × 70 = 933" },
  { code: "RC-03", title: "Kabotaj · kılavuzluk · 2.980 GT", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 2980, tariffCategory: "KABOTAJ" }, expected: "120.00", working: "70 + ⌈1980/1000⌉=2 × 25 = 120" },
  { code: "RC-04", title: "Kabotaj · Türk bayrağı indirimi uygulanmaz", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 2980, tariffCategory: "KABOTAJ", conditionCodes: ["TR_FLAG"] }, expected: "120.00", working: "Kabotaj sütunu TR bayrak indiriminden yararlanamaz → 120" },
  { code: "RC-05", title: "Diğer yük · TR bayrak · 2.980 GT", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 2980, tariffCategory: "DIGER_YUK", conditionCodes: ["TR_FLAG"] }, expected: "287.20", working: "(197 + 2 × 81 = 359) × 0,80 = 287,20" },
  { code: "RC-06", title: "Tehlikeli yük %30 + TR bayrak %20 → oran farkı", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 2980, tariffCategory: "DIGER_YUK", conditionCodes: ["DANGEROUS_CARGO_OTHER", "TR_FLAG"] }, expected: "394.90", working: "359 × (1 + 0,30 − 0,20) = 359 × 1,10 = 394,90" },
  { code: "RC-07", title: "Liner konteyner · tehlikeli yük %20 · 45.000 GT", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 45000, tariffCategory: "LINER_KONTEYNER", conditionCodes: ["DANGEROUS_CARGO_CRP"] }, expected: "3615.60", working: "(153 + 44 × 65 = 3013) × 1,20 = 3615,60" },
  { code: "RC-08", title: "Ro-Ro · römorkör · 25.000 GT · 2 römorkör", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "TOWAGE", gt: 25000, tariffCategory: "YOLCU_RORO", requestedUnits: 2, allocatedUnits: 2 }, expected: "2368.00", working: "(224 + 24 × 40 = 1184) × 2 = 2368" },
  { code: "RC-09", title: "120.000 GT tavanı · 150.000 GT", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 150000, tariffCategory: "DIGER_YUK" }, expected: "9836.00", working: "Tavan 120.000 GT: 197 + 119 × 81 = 9836" },
  { code: "RC-10", title: "Bayram %50 ile tehlikeli yük %30 → en yüksek artırım", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 1000, tariffCategory: "DIGER_YUK", conditionCodes: ["HOLIDAY", "DANGEROUS_CARGO_OTHER"] }, expected: "295.50", working: "197 × 1,50 = 295,50 (yalnız en yüksek artırım)" },
  { code: "RC-11", title: "Emniyet römorkörü (Petkim tarifesi) · 50 t · 61 dk", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "STANDBY_TUG", gt: null, bollardPullT: 50, measuredMinutes: 61, tariffCategory: "DIGER_YUK" }, expected: "1500.00", working: "45–60 t: 750 USD/saat × 2 saat (saat ve kesri) = 1500" },
  { code: "RC-12", title: "Kabotaj · palamar · 2.980 GT", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "MOORING", gt: 2980, tariffCategory: "KABOTAJ" }, expected: "23.00", working: "11 + 2 × 6 = 23 (VN-05 'yarısı' ifadesi çözülmedi)" },
  { code: "RC-13", title: "Kademe sınırı · tam 1.000 GT", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 1000, tariffCategory: "DIGER_YUK" }, expected: "197.00", working: "İlk 1000 GT = 197 (VN-03)" },
  { code: "RC-14", title: "Tablo satırı · diğer yük kılavuzluk <2000 GT", versionId: V, source: "OFFICIAL_EXAMPLE", input: { ...base, serviceKind: "PILOTAGE", gt: 1500, tariffCategory: "DIGER_YUK" }, expected: "278.00", working: "Kaynak tablo satırı '<2000: 278'" },
  { code: "RC-15", title: "Tablo satırı · kabotaj römorkör <3000 GT", versionId: V, source: "OFFICIAL_EXAMPLE", input: { ...base, serviceKind: "TOWAGE", gt: 2500, tariffCategory: "KABOTAJ" }, expected: "169.00", working: "Kaynak tablo satırı '<3000: 169'" },
  { code: "RC-16", title: "Yarım ücret · gemi kaynaklı tamamlanamama", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 8450, tariffCategory: "DIGER_YUK", completion: "INCOMPLETE_STARTED_VESSEL_OR_FACILITY_CAUSE" }, expected: "422.50", working: "845 × 0,50 = 422,50" },
  { code: "RC-17", title: "Bayram %50 + mücbir iskele değişikliği −%50", versionId: V, source: "INDEPENDENT_MANUAL", input: { ...base, serviceKind: "PILOTAGE", gt: 1000, tariffCategory: "DIGER_YUK", conditionCodes: ["HOLIDAY", "FORCE_MAJEURE_SHIFT"] }, expected: "197.00", working: "197 × (1 + 0,50 − 0,50) = 197" },
  { code: "RC-18", title: "Tablo satırı · yolcu/Ro-Ro römorkör <2000 GT", versionId: V, source: "OFFICIAL_EXAMPLE", input: { ...base, serviceKind: "TOWAGE", gt: 1999, tariffCategory: "YOLCU_RORO" }, expected: "264.00", working: "Kaynak tablo satırı '<2000: 264'" },
];
