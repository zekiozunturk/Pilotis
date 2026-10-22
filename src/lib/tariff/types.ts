export type ServiceKind =
  | "PILOTAGE" | "TOWAGE" | "MOORING" | "UNMOORING" | "LINE_HANDLING" | "CHARTER" | "SALVAGE_REVIEW" | "SPECIAL" | "STANDBY_TUG";

export type RuleStatus = "DRAFT" | "SOURCE_FOUND" | "EXPERT_REVIEW" | "APPROVED" | "IN_FORCE" | "REPEALED";

/** GT kademesi: gtMax'a kadar sabit taban + her ilave blok için ek bedel */
export interface GtBand {
  gtFrom: number;          // dahil
  gtTo: number | null;     // dahil; null = üst sınır yok
  base: string;            // Decimal string
  perBlock?: string;       // gtFrom üstündeki her blok için
  blockSize?: number;      // ör. 1000 GT
  blockStart?: number;     // blokların sayılmaya başladığı GT (ör. 1000)
}

export interface HourRounding {
  /** CEIL_HOUR: her başlamış saat tam saat; CEIL_HALF: yarım saate yukarı */
  mode: "CEIL_HOUR" | "CEIL_HALF" | "EXACT_MINUTE";
  minimumHours: number;
}

/** Çeki gücü (ton) aralığı — standby römorkör gibi GT'den bağımsız hizmetler */
export interface BollardBand { fromT: number; toT: number | null; rate: string }

export interface ServiceTariff {
  unit: "EVENT" | "HOUR";
  pricing?: "GT_BANDS" | "BOLLARD_PULL";
  bands: GtBand[];
  bollardBands?: BollardBand[];
  gtCap?: number;            // ör. 120.000 GT üstü için 120.000 GT ücreti
  itemCode?: string;         // fiyat listesi kalemi (200.010) — varsa birim fiyat bu kalemin formülünden
  note?: string;
  rounding?: HourRounding;   // unit=HOUR ise zorunlu
  ruleCodes: string[];
}

export interface Adjustment {
  code: string;
  label: string;
  kind: "SURCHARGE" | "DISCOUNT";
  rate: string;             // 0.50 = %50
  appliesTo: ServiceKind[];
  ruleCode: string;
  onlyCategories?: string[];
  excludeCategories?: string[];
}

export interface TariffCategory { label: string; services: Partial<Record<ServiceKind, ServiceTariff>> }

export interface VerificationNote { id: string; text: string; resolved: boolean; resolution?: string }

export interface TariffDefinition {
  /** Kategorisiz (tek sütunlu) tarifeler için */
  services: Partial<Record<ServiceKind, ServiceTariff>>;
  /** Kategorili tarifeler: KABOTAJ, YOLCU_RORO, LINER_KONTEYNER, DIGER_YUK ... */
  categories?: Record<string, TariffCategory>;
  /** Çözülmemiş not = sürüm onaylanamaz, hesap üretime geçemez */
  verificationNotes?: VerificationNote[];
  source?: { title: string; docNo?: string; url?: string; publishedAt?: string; note?: string };
  /** Kodlu fiyat listesi kalemleri (sabit fiyat veya formül, kalem bazında para birimi) */
  items?: import("../pricing/pricelist").PriceItem[];
  adjustments: Adjustment[];
  moneyScale: number;       // nihai yuvarlama hanesi
}

export interface TariffVersionInput {
  id: string;
  label: string;
  validFrom: string;        // ISO
  validTo: string;          // ISO (dahil, gün sonu)
  currency: string;
  status: RuleStatus;
  isDemo: boolean;
  definition: TariffDefinition;
}

export type Completion =
  | "COMPLETED"
  | "INCOMPLETE_STARTED_VESSEL_OR_FACILITY_CAUSE"
  | "INCOMPLETE_STARTED_OTHER_CAUSE"
  | "CANCELLED_BEFORE_START";

export interface CalcInput {
  operationRef: string;
  serviceKind: ServiceKind;
  serviceDate: string;          // ISO UTC — tarife sürüm seçimi buna göre
  gt: number | null;            // doğrulanmış GT; null = eksik (asla 0)
  measuredMinutes?: number | null; // HOUR birimli hizmetlerde gerçek süre
  allocatedUnits: number;       // tahsis edilen araç
  requestedUnits: number;       // talep/standart araç sayısı
  extraUnitsWrittenRequest: boolean; // R-004 kaptanın yazılı talebi var mı
  conditionCodes: string[];     // NO_ENGINE, REPAIR_YARD ...
  completion: Completion;
  waitingMinutes?: number;      // kaydedilir, ücretlendirilmez (R-003)
  tariffCategory?: string | null;      // kategorili tarifelerde zorunlu
  categoryReason?: string | null;      // kategori neden seçildi
  categoryAssumed?: boolean;           // varsayıma dayanıyorsa üretime geçmez
  bollardPullT?: number | null;        // standby römorkör için
  fx?: import("../pricing/pricelist").FxTable; // hizmet anındaki kur (TL karşılığı için)
}

export interface RuleTrace {
  ruleCode: string;
  applied: boolean;
  description: string;
  reason: string;
}

export interface CalcResult {
  operationRef: string;
  serviceKind: ServiceKind;
  tariffVersionId: string;
  tariffLabel: string;
  currency: string;
  categoryReason: string;
  verifiedInputs: Record<string, unknown>;
  baseAmount: string;
  measuredQuantity: string | null;
  billedQuantity: string;
  billedUnits: number;
  adjustmentRate: string;
  rules: RuleTrace[];
  netAmount: string;            // liste (kalem) para biriminde
  /** Operasyonel para birimi TL karşılığı; kur yoksa null (asla varsayılmaz) */
  operational: { amount: string; currency: "TRY"; rate: string; rateDate: string; rateSource: string } | null;
  itemCode?: string | null;
  formulaTrace?: string[];
  missing: string[];
  productionEligible: boolean;
  productionBlockers: string[];
  inputHash: string;
  calcId: string;
}
