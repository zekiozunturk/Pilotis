/**
 * KAYNAKLI TARİFE (statü: SOURCE_FOUND) — onaylı değildir.
 * Kaynak: Petkim Liman Hizmetleri Tarifesi, Doküman No ABU-TRO-LST-0141, Rev.4, yayın 31.12.2025,
 *         dayanak: UAB Makam Oluru 2187670 (19.09.2024) KRP Ücret Yönergesi.
 * Değerler kaynaktan aynen aktarılmıştır; belirsizlikler verificationNotes içinde açık tutulur.
 */
import type { TariffVersionInput, ServiceTariff, TariffCategory } from "@/lib/tariff/types";

const gt = (base: string, perBlock: string, rules: string[], extra: Partial<ServiceTariff> = {}): ServiceTariff => ({
  unit: "EVENT", pricing: "GT_BANDS", gtCap: 120000, ruleCodes: ["R-009", ...rules],
  bands: [{ gtFrom: 0, gtTo: null, base, perBlock, blockSize: 1000, blockStart: 1000 }], ...extra,
});

const STANDBY: ServiceTariff = {
  unit: "HOUR", pricing: "BOLLARD_PULL", ruleCodes: ["R-009", "R-015"], bands: [],
  rounding: { mode: "CEIL_HOUR", minimumHours: 1 },
  bollardBands: [
    { fromT: 16, toT: 30, rate: "400" }, { fromT: 30, toT: 45, rate: "600" }, { fromT: 45, toT: 60, rate: "750" },
    { fromT: 60, toT: 80, rate: "1000" }, { fromT: 80, toT: null, rate: "1250" },
  ],
  note: "Standby römorkör, çeki gücüne göre USD/saat; saat ve kesri için",
};

const cat = (label: string, p: [string, string], t: [string, string], m: [string, string]): TariffCategory => ({
  label,
  services: {
    PILOTAGE: gt(p[0], p[1], ["R-001"]),
    TOWAGE: gt(t[0], t[1], ["R-001", "R-021"], { note: "Römorkör başına; süre esası doğrulanacak (R-021)" }),
    MOORING: gt(m[0], m[1], ["R-001"]),
    UNMOORING: gt(m[0], m[1], ["R-001"]),
    STANDBY_TUG: STANDBY,
  },
});

export const KRP_PETKIM_REV4: TariffVersionInput = {
  id: "krp-2025-petkim-rev4",
  label: "KRP tavan ücretleri — Petkim Rev.4 aktarımı (dönem doğrulanacak)",
  validFrom: "2025-02-01T00:00:00+03:00",
  validTo: "2026-01-31T23:59:59+03:00",
  currency: "USD",
  status: "SOURCE_FOUND",
  isDemo: false,
  definition: {
    moneyScale: 2,
    services: {},
    source: { title: "Petkim Liman Hizmetleri Tarifesi", docNo: "ABU-TRO-LST-0141 Rev.4", url: "https://www.petkim.com.tr/assets/uploads/petkim-liman-hizmetleri-tarifleri.pdf", publishedAt: "2025-12-31", note: "Dayanak: UAB Makam Oluru 2187670 (19.09.2024). Resmî Bakanlık eki ile karşılaştırılmalıdır." },
    categories: {
      KABOTAJ: cat("Kabotaj hattında çalışan gemiler", ["70", "25"], ["119", "25"], ["11", "6"]),
      YOLCU_RORO: cat("Yolcu, transit yük, Ro-Ro, araç taşıyan", ["116", "46"], ["224", "40"], ["22", "11"]),
      LINER_KONTEYNER: cat("Liner konteyner", ["153", "65"], ["299", "56"], ["22", "11"]),
      DIGER_YUK: cat("Diğer yük gemileri", ["197", "81"], ["373", "70"], ["22", "11"]),
    },
    adjustments: [
      { code: "DANGEROUS_CARGO_CRP", label: "Tehlikeli yük — konteyner / Ro-Ro / Ro-Pax", kind: "SURCHARGE", rate: "0.20", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-024" },
      { code: "DANGEROUS_CARGO_OTHER", label: "Tehlikeli yük — diğer gemiler", kind: "SURCHARGE", rate: "0.30", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-024" },
      { code: "HOLIDAY", label: "Ulusal bayram / genel tatil (2429 s. Kanun)", kind: "SURCHARGE", rate: "0.50", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-025" },
      { code: "NON_COMPLIANCE", label: "Kılavuz/römorkör alma zorunluluğuna uyulmaması", kind: "SURCHARGE", rate: "1.00", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-026" },
      { code: "NO_ENGINE", label: "Makinesiz çekilme", kind: "SURCHARGE", rate: "0.50", appliesTo: ["TOWAGE"], ruleCode: "R-006" },
      { code: "TR_FLAG", label: "Türk bayraklı gemi indirimi", kind: "DISCOUNT", rate: "0.20", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-027", excludeCategories: ["KABOTAJ"] },
      { code: "FORCE_MAJEURE_SHIFT", label: "Mücbir sebeple iskele/rıhtım değişikliği", kind: "DISCOUNT", rate: "0.50", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-008" },
    ],
    verificationNotes: [
      { id: "VN-01", text: "Kaynakta kabotaj kılavuzluk artışı '+235' yazılı.", resolved: true, resolution: "Aynı sütunda '<2000 GT: 95' satırı 70 + 25 = 95 ile tutarlı; '+235' yazım hatası, +25 uygulandı." },
      { id: "VN-02", text: "Belge 31.12.2025 yayımlı: kapsadığı dönem (Şubat 2025–Ocak 2026 mı, 2026 mı?) Bakanlık ekiyle doğrulanmalı.", resolved: false },
      { id: "VN-03", text: "Kademe sınırı: kaynak '<1000' diyor; tam 1000 GT'nin ilk kademede mi olduğu doğrulanmalı (motor: 1000 dahil ilk kademe).", resolved: false },
      { id: "VN-04", text: "Römorkör ücreti manevra başına mı, süreye bağlı mı? (R-021) — motor: römorkör başına manevra.", resolved: false },
      { id: "VN-05", text: "Palamar: 'tavan ücret tablosunun ilgili sütunundaki değerin yarısı esas alınarak, yanaşma ve ayrılma tek kalem' ifadesi; yolcu/Ro-Ro ve liner sütunları kaynakta yok (diğer yük değerleri kullanıldı).", resolved: false },
      { id: "VN-06", text: "Kılavuzluk/römorkörden ayrı verilen palamar: hizmet ve bot başına 100 USD sabit (zamlar uygulanmaz) — henüz modellenmedi.", resolved: false },
      { id: "VN-07", text: "Standby çeki gücü sınırları çakışıyor (16–30, 30–45…); motor [alt, üst) kabul ediyor; 16 t altı tanımsız.", resolved: false },
    ],
  },
};
