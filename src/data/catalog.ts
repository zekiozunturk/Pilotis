/** Başlangıç katalogları. Kaynağı belirtilmemiş sayısal değer yoktur; ÖRNEK veriler isDemo ile işaretlidir. */
import type { TariffVersionInput } from "@/lib/tariff/types";

/** Operasyonel para birimi ve fatura ibaresi */
export const OPERATIONAL_CURRENCY = "TRY";
export const INVOICE_NOTE = "Faturalar Türk Lirası (TL) olarak düzenlenir. Döviz cinsinden gösterilen tutarlar bilgi amaçlıdır; döviz tarifeli kalemler TCMB kuru ile TL'ye çevrilir.";

export const BRAND = {
  name: "PILOTIS",
  long: "Pilotage Integrated Logistics, Operations & Tariff Information System",
  slogan: "The Intelligence Behind Every Maneuver.",
};

/** Kaynak: www.yalovapilotaj.com (22.10.2026 tarihinde okundu) */
export const OPERATOR = {
  legalName: "Yalova Pilotaj A.Ş.",
  founded: 2017,
  address: "Çavuşçiftliği Köyü Tersaneler Bölgesi Mevkii Plajyolu Sok. No:12/1 Altınova / YALOVA",
  phone: "0 226 461 20 77",
  email: "info@yalovapilotaj.com",
  website: "https://www.yalovapilotaj.com",
  instagram: "https://www.instagram.com/yalovapilotaj/",
  legacyPortal: "https://yalovapilot.com/login",
  logoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/logo-2.png",
  services: ["Kılavuzluk Hizmeti", "Römorkör Hizmeti", "Çevre ve Liman Hizmetleri", "Acil Durum Hizmetleri"],
  motto: "7/24 Kesintisiz Hizmet",
};

/** Kaynak: yalovapilotaj.com/filo — teknik özellikler henüz alınmadı (AK-01) */
export const FLEET_SEED = [
  { name: "Yalova 2", type: "TUG", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/DSC00175-min-min.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/yalova-2-2/" },
  { name: "Yalova 3", type: "TUG", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/yaloova3-min.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/yalova-3/" },
  { name: "Yalova 4", type: "TUG", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/yalova44444444444444-min-min.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/yalova-4/" },
  { name: "Yalova 5", type: "TUG", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/yalova5.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/yalova-5/" },
  { name: "Palamar Bot 1", type: "MOORING_BOAT", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/DSC00361-scaled.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/palamar-bot-1/" },
  { name: "Palamar Bot 2", type: "MOORING_BOAT", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/DSC00373-scaled.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/yalova-2/" },
  { name: "Pilot Bot 1", type: "PILOT_BOAT", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/DSC00451-min-min.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/pilot-bot-2/" },
  { name: "Pilot Bot 2", type: "PILOT_BOAT", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/02/DSC00278-min-scaled.jpg", sourceUrl: "https://www.yalovapilotaj.com/filo/pilot-bot-1/" },
  { name: "Deniz Yüzeyi Temizleme Teknesi", type: "SURFACE_CLEANING_VESSEL", photoUrl: "https://www.yalovapilotaj.com/wp-content/uploads/2023/03/MY-ECO.png", sourceUrl: "https://www.yalovapilotaj.com/filo/deniz-yuzeyi-temizleme-teknemiz/" },
] as const;

type SK = "PILOTAGE" | "TOWAGE" | "MOORING" | "UNMOORING" | "LINE_HANDLING" | "CHARTER" | "SALVAGE_REVIEW" | "SPECIAL" | "STANDBY_TUG";
export const OPERATION_TYPES: { code: string; nameTr: string; nameEn: string; kinds: SK[]; families: string[]; unit: string }[] = [
  { code: "OP-001", nameTr: "Yanaşma", nameEn: "Berthing", kinds: ["PILOTAGE", "TOWAGE", "MOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-002", nameTr: "Kalkış / ayrılma", nameEn: "Unberthing", kinds: ["PILOTAGE", "TOWAGE", "UNMOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-003", nameTr: "Aynı tesis içinde yer değiştirme", nameEn: "Shifting within facility", kinds: ["PILOTAGE", "TOWAGE", "MOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-004", nameTr: "Tesisler / tersaneler arası transfer", nameEn: "Inter-yard transfer", kinds: ["PILOTAGE", "TOWAGE", "UNMOORING", "MOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-005", nameTr: "Bakım-onarım amacıyla tersaneye giriş", nameEn: "Yard entry for repair", kinds: ["PILOTAGE", "TOWAGE", "MOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-006", nameTr: "Bakım-onarım sonrası çıkış", nameEn: "Yard exit after repair", kinds: ["PILOTAGE", "TOWAGE", "UNMOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-007", nameTr: "Deneme seyri", nameEn: "Sea trial", kinds: ["PILOTAGE", "TOWAGE"], families: ["MINISTRY"], unit: "Saat" },
  { code: "OP-008", nameTr: "Demirleme", nameEn: "Anchoring", kinds: ["PILOTAGE"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-009", nameTr: "Demirden kaldırma", nameEn: "Heaving anchor", kinds: ["PILOTAGE"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-010", nameTr: "Kendinden hareket edemeyen geminin çekilmesi", nameEn: "Dead-ship tow", kinds: ["TOWAGE", "PILOTAGE"], families: ["MINISTRY"], unit: "Saat" },
  { code: "OP-011", nameTr: "Refakat", nameEn: "Escort", kinds: ["TOWAGE"], families: ["MINISTRY"], unit: "Saat" },
  { code: "OP-012", nameTr: "Emniyet amacıyla hazır bekleme", nameEn: "Safety standby", kinds: ["STANDBY_TUG"], families: ["MINISTRY", "CHARTER"], unit: "Saat" },
  { code: "OP-013", nameTr: "Ağır hava nedeniyle müdahale", nameEn: "Heavy weather assistance", kinds: ["TOWAGE"], families: ["MINISTRY", "KEGM"], unit: "Saat" },
  { code: "OP-014", nameTr: "Sürüklenen / kontrolünü kaybetmiş gemiye müdahale", nameEn: "Drifting vessel response", kinds: ["TOWAGE", "SALVAGE_REVIEW"], families: ["KEGM", "SALVAGE"], unit: "Saat" },
  { code: "OP-015", nameTr: "Yetkili makam görevlendirmesi", nameEn: "Authority-ordered task", kinds: ["TOWAGE"], families: ["KEGM"], unit: "Saat" },
  { code: "OP-016", nameTr: "Kurtarma-yardım değerlendirmesi gerektiren olay", nameEn: "Salvage assessment", kinds: ["SALVAGE_REVIEW"], families: ["SALVAGE"], unit: "Dosya" },
  { code: "OP-017", nameTr: "Palamar bağlama", nameEn: "Mooring", kinds: ["MOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-018", nameTr: "Palamar çözme", nameEn: "Unmooring", kinds: ["UNMOORING"], families: ["MINISTRY"], unit: "Manevra" },
  { code: "OP-019", nameTr: "Halat taşıma / halat operasyonu", nameEn: "Line handling", kinds: ["LINE_HANDLING"], families: ["MINISTRY"], unit: "Operasyon" },
  { code: "OP-020", nameTr: "Deniz aracı kiralama", nameEn: "Craft charter", kinds: ["CHARTER"], families: ["CHARTER"], unit: "Saat" },
  { code: "OP-021", nameTr: "Yangın veya çevre müdahalesi", nameEn: "Fire / pollution response", kinds: ["TOWAGE", "SPECIAL"], families: ["KEGM", "SPECIAL_CONTRACT"], unit: "Saat" },
  { code: "OP-022", nameTr: "Onaylı özel hizmet", nameEn: "Approved special service", kinds: ["SPECIAL"], families: ["SPECIAL_CONTRACT"], unit: "Sözleşme" },
];

export const RULES: { code: string; title: string; label: "REGULATION" | "CONTRACT" | "OPERATING_PRACTICE" | "INTL_GOOD_PRACTICE"; status: "DRAFT" | "SOURCE_FOUND" | "EXPERT_REVIEW" | "APPROVED" | "IN_FORCE"; basis: string; modules: string[] }[] = [
  { code: "R-001", title: "Hizmet başlangıcı hizmet türüne göre ayrı olaydır", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi md. 5", modules: ["Saha", "Hesap"] },
  { code: "R-002", title: "Yarım ücret yalnız başlamış hizmetin gemi/tesis kaynaklı tamamlanamamasında", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi md. 6", modules: ["Hesap", "İptal"] },
  { code: "R-003", title: "Gemi/tesis kaynaklı aksamada ayrıca bekleme ücreti alınmaz", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi md. 6", modules: ["Hesap"] },
  { code: "R-004", title: "İlave römorkör kaptanın yazılı talebiyle ücretlendirilir", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi", modules: ["Hesap", "Belge"] },
  { code: "R-005", title: "En yüksek artırım/indirim esas; birlikte oran farkı", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi", modules: ["Hesap"] },
  { code: "R-006", title: "Makinesiz çekilme %50 artırımı yalnız römorkörcülükte", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi", modules: ["Hesap"] },
  { code: "R-007", title: "Tamamlanmadan itibaren en geç 48 saatte idare sistemine giriş", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi", modules: ["Bildirim"] },
  { code: "R-008", title: "Başlamadan hava iptali ≠ hava nedeniyle fiilî yer değiştirme", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi md. 5–6", modules: ["İptal", "Hesap"] },
  { code: "R-009", title: "Tarife sürümü hizmet tarihine göre seçilir", label: "REGULATION", status: "SOURCE_FOUND", basis: "UAB DGM KRP ücret tablosu 01.02.2026–31.01.2027", modules: ["Tarife"] },
  { code: "R-010", title: "Kıyı Emniyeti tarifesi ayrı tarife ailesidir", label: "REGULATION", status: "DRAFT", basis: "KEGM tarife metni (16.09.2026)", modules: ["Tarife"] },
  { code: "R-011", title: "Olağan talepler en az 6 saat önce bildirilir", label: "OPERATING_PRACTICE", status: "DRAFT", basis: "Doğrulanacak", modules: ["Talep"] },
  { code: "R-012", title: "Bakım-onarım indirimi ve yük elleçleme etkisi", label: "REGULATION", status: "DRAFT", basis: "Doğrulanacak", modules: ["Hesap"] },
  { code: "R-013", title: "Belirli tonaj tankerlerde asgari römorkör sayısı", label: "REGULATION", status: "DRAFT", basis: "Limanlar Yönetmeliği / yerel talimat", modules: ["Römorkör kararı"] },
  { code: "R-014", title: "Gas-free / boş tanker / yük kalıntısı etkisi", label: "REGULATION", status: "DRAFT", basis: "Doğrulanacak", modules: ["Beyan", "Hesap"] },
  { code: "R-015", title: "Saat kesri yuvarlaması ve LYBS'ye yansıması", label: "REGULATION", status: "DRAFT", basis: "Ücret tablosu + LYBS alan tanımı", modules: ["Süre", "Bildirim"] },
  { code: "R-016", title: "Ekrana çizilen imza güvenli e-imza sayılmaz", label: "REGULATION", status: "APPROVED", basis: "5070 s. Elektronik İmza Kanunu", modules: ["Belge"] },
  { code: "R-017", title: "Kan grubu sağlık verisidir; kısıtlı erişim", label: "REGULATION", status: "APPROVED", basis: "KVKK md. 6", modules: ["Personel", "Yetki"] },
  { code: "R-018", title: "Talep eden taraf otomatik fatura muhatabı değildir", label: "OPERATING_PRACTICE", status: "APPROVED", basis: "PILOTIS şartnamesi §3", modules: ["Taraflar", "Talep"] },
  { code: "R-019", title: "Tahsis edilen ≠ ücretlendirilebilir römorkör sayısı", label: "OPERATING_PRACTICE", status: "APPROVED", basis: "PILOTIS şartnamesi §9 + R-004", modules: ["Planlama", "Hesap"] },
  { code: "R-021", title: "Römorkör ücretinin esası: manevra başına / süreye bağlı", label: "REGULATION", status: "DRAFT", basis: "KRP Yönergesi eki — doğrulanacak (VN-04)", modules: ["Hesap"] },
  { code: "R-022", title: "Yeterli thruster'lı gemide 1 römorkör eksik kullanım (DG tanker ve 200 m+ hariç)", label: "REGULATION", status: "SOURCE_FOUND", basis: "Petkim ABU-TRO-LST-0141 Rev.4 (KRP Yönergesi'ne dayanır)", modules: ["Römorkör kararı"] },
  { code: "R-023", title: "120.000 GT üzeri gemilere 120.000 GT ücreti", label: "REGULATION", status: "SOURCE_FOUND", basis: "Petkim ABU-TRO-LST-0141 Rev.4", modules: ["Hesap"] },
  { code: "R-024", title: "Tehlikeli yük artırımı: konteyner/Ro-Ro/Ro-Pax %20, diğer %30", label: "REGULATION", status: "SOURCE_FOUND", basis: "Petkim ABU-TRO-LST-0141 Rev.4", modules: ["Hesap"] },
  { code: "R-025", title: "Ulusal bayram ve genel tatil günleri %50 artırım (2429 s. Kanun)", label: "REGULATION", status: "SOURCE_FOUND", basis: "Petkim ABU-TRO-LST-0141 Rev.4; 2429 s. Kanun", modules: ["Hesap"] },
  { code: "R-026", title: "Kılavuz/römorkör alma zorunluluğuna uyulmaması %100 artırım", label: "REGULATION", status: "SOURCE_FOUND", basis: "Petkim ABU-TRO-LST-0141 Rev.4", modules: ["Hesap"] },
  { code: "R-027", title: "Türk bayraklı gemiye %20 indirim (kabotaj sütunu hariç)", label: "REGULATION", status: "SOURCE_FOUND", basis: "Petkim ABU-TRO-LST-0141 Rev.4", modules: ["Hesap"] },
  { code: "R-028", title: "Ücretler USD; her yıl 1 Şubat'tan itibaren ABD TÜFE oranında güncellenir; negatifse önceki ücret", label: "REGULATION", status: "SOURCE_FOUND", basis: "KRP Yönergesi md. 5(1)(b)", modules: ["Tarife"] },
  { code: "R-020", title: "Dinlenme kontrolü kayan zaman penceresiyle", label: "INTL_GOOD_PRACTICE", status: "EXPERT_REVIEW", basis: "STCW A-VIII/1 (uygulanabilirlik doğrulanacak)", modules: ["Personel", "Planlama"] },
];

export const OPEN_ISSUES = [
  { code: "AK-01", topic: "Römorkör kimlik ve teknik özellikleri (sitede 4 römorkör, şartnamede 7)", owner: "Filo sorumlusu", document: "Tonilato, BP test raporları", target: "Faz 1 sonu", module: "Filo" },
  { code: "AK-02", topic: "Resmî hizmet sahası koordinatları", owner: "İşletme / Liman Başkanlığı", document: "Yetki belgesi eki", target: "Faz 7", module: "Harita" },
  { code: "AK-03", topic: "Yalova Liman Başkanlığı yerel talimatları", owner: "İşletme", document: "Talimat metni", target: "Faz 3", module: "Kural kataloğu" },
  { code: "AK-04", topic: "Gerçek talepname, taahhütname, bill örnekleri", owner: "Operasyon", document: "Anonim örnekler", target: "Faz 2", module: "Belgeler" },
  { code: "AK-05", topic: "Onaylı özel hizmet sözleşmeleri", owner: "Yönetim", document: "Sözleşmeler", target: "Faz 3", module: "Tarife" },
  { code: "AK-06", topic: "ETA Excel cari/fatura örnekleri ve ETA sürümü", owner: "Muhasebe", document: ".xlsx örnekleri", target: "Faz 6", module: "Muhasebe" },
  { code: "AK-07", topic: "LYBS alan tanımları ve erişim yöntemi", owner: "Bildirim sorumlusu", document: "Kılavuz / ekranlar", target: "Faz 6", module: "Bildirim" },
  { code: "AK-08", topic: "KRP Yönergesi resmî nüshası ve değişiklikler", owner: "Tarife sorumlusu", document: "Resmî PDF", target: "Faz 3", module: "Kural kataloğu" },
  { code: "AK-09", topic: "Personel listesi, unvanlar, yeterlik belgeleri", owner: "İK", document: "Excel liste", target: "Faz 1", module: "Personel" },
  { code: "AK-10", topic: "Ekip şablonu ve asgari emniyetli donatım belgeleri", owner: "Filo", document: "Donatım belgeleri", target: "Faz 5", module: "Planlama" },
  { code: "AK-11", topic: "Tersane/kıyı tesisleri doğrulanmış listesi ve koordinatları", owner: "Operasyon", document: "Tesis listesi", target: "Faz 2", module: "Taraflar" },
  { code: "AK-12", topic: "Hizmet bazlı KDV/istisna eşlemesi", owner: "Muhasebe / Mali müşavir", document: "Görüş yazısı", target: "Faz 6", module: "Tahakkuk" },
  { code: "AK-13", topic: "RPO/RTO hedefleri", owner: "Yönetim", document: "Karar", target: "Faz 9", module: "Altyapı" },
  { code: "AK-15", topic: "KRP 2026–2027 resmî ücret eki (veya DGM'nin duyurduğu ABD TÜFE oranı) — Petkim Rev.4 aktarımının dönemi ve 7 doğrulama notu", owner: "Tarife sorumlusu", document: "Bakanlık KRP ücret eki (DOCX/PDF) veya DGM duyurusu", target: "Faz 3 kapanışı", module: "Tarife" },
  { code: "AK-16", topic: "2026–2027 dini bayram tarihleri (Diyanet) ve arife yarım gün uygulamasının tarifeye yansıması", owner: "Tarife sorumlusu", document: "Diyanet takvimi / Bakanlık görüşü", target: "Faz 3", module: "Tarife (R-025)" },
  { code: "AK-17", topic: "Döviz kalemlerin TL'ye çevriminde kur tipi (TCMB döviz satış/alış) ve kur tarihi kuralı (önceki bülten / fatura tarihi) — varsayılan: önceki bülten, döviz satış", owner: "Muhasebe / Mali müşavir", document: "Görüş yazısı", target: "Faz 4", module: "Kur, Tahakkuk" },
  { code: "AK-14", topic: "Mevcut Yalova Pilot Portal verisi ve 'Manevra Hesaplama' mantığı", owner: "İşletme", document: "Erişim / dışa aktarım", target: "Faz 2", module: "Göç, Hesap" },
];

/**
 * ÖRNEK TARİFE — resmî rakam DEĞİLDİR. Yalnız motorun davranışını göstermek için.
 * Gerçek değerler UAB DGM ücret tablosundan girilip onaylanana kadar üretim tahakkuku üretemez.
 */
export const DEMO_TARIFF: TariffVersionInput = {
  id: "demo-krp-2026",
  label: "ÖRNEK — KRP 01.02.2026–31.01.2027 yapısı",
  validFrom: "2026-02-01T00:00:00+03:00",
  validTo: "2027-01-31T23:59:59+03:00",
  currency: "USD",
  status: "DRAFT",
  isDemo: true,
  definition: {
    moneyScale: 2,
    services: {
      PILOTAGE: { unit: "EVENT", ruleCodes: ["R-001", "R-009"], bands: [
        { gtFrom: 0, gtTo: 1000, base: "100" },
        { gtFrom: 1001, gtTo: null, base: "100", perBlock: "40", blockSize: 1000, blockStart: 1000 },
      ] },
      TOWAGE: { unit: "HOUR", ruleCodes: ["R-001", "R-009", "R-015"], rounding: { mode: "CEIL_HOUR", minimumHours: 1 }, bands: [
        { gtFrom: 0, gtTo: 2000, base: "300" },
        { gtFrom: 2001, gtTo: 5000, base: "450" },
        { gtFrom: 5001, gtTo: null, base: "450", perBlock: "50", blockSize: 1000, blockStart: 5000 },
      ] },
      MOORING: { unit: "EVENT", ruleCodes: ["R-001", "R-009"], bands: [
        { gtFrom: 0, gtTo: 1000, base: "40" },
        { gtFrom: 1001, gtTo: null, base: "40", perBlock: "10", blockSize: 1000, blockStart: 1000 },
      ] },
      UNMOORING: { unit: "EVENT", ruleCodes: ["R-001", "R-009"], bands: [
        { gtFrom: 0, gtTo: 1000, base: "40" },
        { gtFrom: 1001, gtTo: null, base: "40", perBlock: "10", blockSize: 1000, blockStart: 1000 },
      ] },
    },
    adjustments: [
      { code: "NO_ENGINE", label: "Makinesiz çekilme", kind: "SURCHARGE", rate: "0.50", appliesTo: ["TOWAGE"], ruleCode: "R-006" },
      { code: "DANGEROUS_CARGO", label: "Tehlikeli yük (örnek)", kind: "SURCHARGE", rate: "0.30", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-005" },
      { code: "REPAIR_YARD", label: "Bakım-onarım indirimi (örnek)", kind: "DISCOUNT", rate: "0.30", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-012" },
      { code: "CABOTAGE", label: "Kabotaj indirimi (örnek)", kind: "DISCOUNT", rate: "0.50", appliesTo: ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"], ruleCode: "R-005" },
    ],
  },
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak", SOURCE_FOUND: "Kaynak bulundu", EXPERT_REVIEW: "Uzman kontrolünde",
  APPROVED: "Onaylı", IN_FORCE: "Yürürlükte", REPEALED: "Yürürlükten kalktı",
};
export const LABEL_LABELS: Record<string, string> = {
  REGULATION: "Mevzuat hükmü", CONTRACT: "Sözleşme şartı", OPERATING_PRACTICE: "İşletme uygulaması", INTL_GOOD_PRACTICE: "Uluslararası iyi uygulama",
};
export const ASSET_LABELS: Record<string, string> = {
  TUG: "Römorkör", PILOT_BOAT: "Kılavuz botu", MOORING_BOAT: "Palamar botu", SURFACE_CLEANING_VESSEL: "Deniz yüzeyi temizleme", LAND_VEHICLE: "Kara aracı", EQUIPMENT: "Ekipman",
};
export const SERVICE_LABELS: Record<string, string> = {
  PILOTAGE: "Kılavuzluk", TOWAGE: "Römorkörcülük", MOORING: "Palamar bağlama", UNMOORING: "Palamar çözme", LINE_HANDLING: "Halat", CHARTER: "Kiralama", SALVAGE_REVIEW: "Kurtarma değ.", SPECIAL: "Özel hizmet", STANDBY_TUG: "Standby römorkör",
};

/** Portal paket kartları — kapsam metinleri işletme onayına tabidir (AK-04). */
export const PACKAGES: { code: string; title: string; scope: string; outOfScope: string; docs: string[]; needsRepair?: boolean; review?: boolean }[] = [
  { code: "OP-001", title: "Standart yanaşma", scope: "Kılavuzluk, gerekli römorkör desteği ve palamar bağlama", outOfScope: "Bekleme sırasında ayrıca hazır bulunma, yer değiştirme", docs: ["Tonilato belgesi", "Talepname", "Fatura muhatabı onayı"] },
  { code: "OP-002", title: "Standart kalkış", scope: "Kılavuzluk, gerekli römorkör desteği ve palamar çözme", outOfScope: "Demirleme, refakat", docs: ["Talepname", "Fatura muhatabı onayı"] },
  { code: "OP-005", title: "Tersane giriş (bakım-onarım)", scope: "Tersaneye giriş manevrası; bakım-onarım indirimi belgeyle değerlendirilir", outOfScope: "Yük elleçleme yapılan işlerde indirim (R-012 doğrulanıyor)", docs: ["Tersane kabul yazısı", "Bakım-onarım amacını gösteren belge", "Tonilato belgesi"], needsRepair: true },
  { code: "OP-004", title: "Tersaneler arası transfer", scope: "Kalkış, seyir ve yanaşma bileşenleri ayrı ayrı değerlendirilir", outOfScope: "Deneme seyri", docs: ["Her iki tesisin kabulü", "Talepname"] },
  { code: "OP-007", title: "Deneme seyri", scope: "Kılavuzluk ve gerekli römorkör refakati, süreye bağlı", outOfScope: "Klas sörveyi hizmetleri", docs: ["Deneme seyri programı", "Klas / tersane yazısı"] },
  { code: "OP-008", title: "Demirleme", scope: "Kılavuzluk", outOfScope: "Demir yerinde hazır bulunma", docs: ["Liman başkanlığı demir yeri izni (gerekirse)"] },
  { code: "OP-009", title: "Demirden kaldırma", scope: "Kılavuzluk", outOfScope: "—", docs: ["Talepname"] },
  { code: "OP-022", title: "Özel hizmet inceleme talebi", scope: "Standart tarifeye uymayan işler için ön inceleme; fiyat ancak onaylı sözleşmeyle oluşur", outOfScope: "Standart hizmeti ikinci kez ücretlendirme", docs: ["İş tanımı", "Teknik ekler"], review: true },
];
