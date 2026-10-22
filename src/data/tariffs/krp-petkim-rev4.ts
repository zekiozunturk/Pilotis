/**
 * KAYNAKLI TARİFE (statü: SOURCE_FOUND) — onaylı değildir.
 * Kaynak: Petkim Liman Hizmetleri Tarifesi, Doküman No ABU-TRO-LST-0141, Rev.4, yayın 31.12.2025,
 *         dayanak: UAB Makam Oluru 2187670 (19.09.2024) KRP Ücret Yönergesi.
 * Değerler kaynaktan aynen aktarılmıştır; belirsizlikler verificationNotes içinde açık tutulur.
 */
import type { TariffVersionInput, ServiceTariff, TariffCategory } from "@/lib/tariff/types";
import type { PriceItem } from "@/lib/pricing/pricelist";

/**
 * Kodlama: ABC.xxx — A: hizmet (1 kılavuzluk, 2 römorkör, 3 palamar bağlama, 4 palamar çözme, 5 standby, 9 diğer)
 *                    B: kategori (1 kabotaj, 2 yolcu/Ro-Ro, 3 liner konteyner, 4 diğer yük)
 * .001 ilk 1000 GT · .002 her ilave 1000 GT · .010 hizmet bedeli (formül; motor bunu ücretlendirir)
 */
const SVC = [["PILOTAGE", 1, "Kılavuzluk"], ["TOWAGE", 2, "Römorkör"], ["MOORING", 3, "Palamar bağlama"], ["UNMOORING", 4, "Palamar çözme"]] as const;
const CATS = [["KABOTAJ", 1, "Kabotaj"], ["YOLCU_RORO", 2, "Yolcu/Ro-Ro"], ["LINER_KONTEYNER", 3, "Liner konteyner"], ["DIGER_YUK", 4, "Diğer yük"]] as const;
const PRICES: Record<string, Record<string, [string, string]>> = {
  PILOTAGE: { KABOTAJ: ["70", "25"], YOLCU_RORO: ["116", "46"], LINER_KONTEYNER: ["153", "65"], DIGER_YUK: ["197", "81"] },
  TOWAGE: { KABOTAJ: ["119", "25"], YOLCU_RORO: ["224", "40"], LINER_KONTEYNER: ["299", "56"], DIGER_YUK: ["373", "70"] },
  MOORING: { KABOTAJ: ["11", "6"], YOLCU_RORO: ["22", "11"], LINER_KONTEYNER: ["22", "11"], DIGER_YUK: ["22", "11"] },
  UNMOORING: { KABOTAJ: ["11", "6"], YOLCU_RORO: ["22", "11"], LINER_KONTEYNER: ["22", "11"], DIGER_YUK: ["22", "11"] },
};

const items: PriceItem[] = [];
for (const [svc, sd, sl] of SVC) for (const [cat, cd, cl] of CATS) {
  const g = `${sd}${cd}0`;
  const [base, blk] = PRICES[svc][cat];
  const unit = svc === "TOWAGE" ? "Römorkör/manevra" : "Manevra";
  items.push(
    { code: `${g}.001`, name: `${sl} — ${cl} — ilk 1000 GT`, unit, currency: "USD", price: base },
    { code: `${g}.002`, name: `${sl} — ${cl} — her ilave 1000 GT`, unit: "Blok (1000 GT)", currency: "USD", price: blk },
    { code: `${g}.010`, name: `${sl} hizmet bedeli — ${cl}`, unit, currency: "USD", formula: `[${g}.001] + BLOK * [${g}.002]`, serviceKind: svc, category: cat },
  );
}
items.push(
  { code: "500.001", name: "Emniyet römorkörü (standby) 16–30 t", unit: "Saat", currency: "USD", price: "400" },
  { code: "500.002", name: "Emniyet römorkörü (standby) 30–45 t", unit: "Saat", currency: "USD", price: "600" },
  { code: "500.003", name: "Emniyet römorkörü (standby) 45–60 t", unit: "Saat", currency: "USD", price: "750" },
  { code: "500.004", name: "Emniyet römorkörü (standby) 60–80 t", unit: "Saat", currency: "USD", price: "1000" },
  { code: "500.005", name: "Emniyet römorkörü (standby) 80 t ve üzeri", unit: "Saat", currency: "USD", price: "1250" },
  { code: "500.010", name: "Emniyet römorkörü (standby) hizmet bedeli (çeki gücüne göre)", unit: "Saat", currency: "USD", formula: "KADEME(CEKI; 16; [500.001]; 30; [500.002]; 45; [500.003]; 60; [500.004]; 80; [500.005])", serviceKind: "STANDBY_TUG" },
  { code: "390.001", name: "Kılavuz/römorkörden ayrı verilen palamar (hizmet ve bot başına, zamsız)", unit: "Bot/hizmet", currency: "USD", price: "100", note: "VN-06 — henüz bir hizmet satırına bağlanmadı" },
);

const svcOf = (svc: string, cat: string, sd: number, cd: number, extra: Partial<ServiceTariff> = {}): ServiceTariff => ({
  unit: "EVENT", pricing: "GT_BANDS", gtCap: 120000, bands: [], itemCode: `${sd}${cd}0.010`,
  ruleCodes: ["R-009", "R-001", ...(svc === "TOWAGE" ? ["R-021"] : [])], ...extra,
});
const STANDBY: ServiceTariff = { unit: "HOUR", pricing: "BOLLARD_PULL", bands: [], itemCode: "500.010", ruleCodes: ["R-009", "R-015"], rounding: { mode: "CEIL_HOUR", minimumHours: 1 }, note: "Saat ve kesri için" };

const categories: Record<string, TariffCategory> = Object.fromEntries(CATS.map(([cat, cd]) => [cat, {
  label: { KABOTAJ: "Kabotaj hattında çalışan gemiler", YOLCU_RORO: "Yolcu, transit yük, Ro-Ro, araç taşıyan", LINER_KONTEYNER: "Liner konteyner", DIGER_YUK: "Diğer yük gemileri" }[cat],
  services: {
    ...Object.fromEntries(SVC.map(([svc, sd]) => [svc, svcOf(svc, cat, sd, cd, svc === "TOWAGE" ? { note: "Römorkör başına; süre esası doğrulanacak (R-021)" } : {})])),
    STANDBY_TUG: STANDBY,
  },
}]));

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
    categories,
    items,
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
