export type ServiceKind =
  | "PILOTAGE" | "TOWAGE" | "MOORING" | "UNMOORING" | "LINE_HANDLING" | "CHARTER" | "SALVAGE_REVIEW" | "SPECIAL";

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

export interface ServiceTariff {
  unit: "EVENT" | "HOUR";
  bands: GtBand[];
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
}

export interface TariffDefinition {
  services: Partial<Record<ServiceKind, ServiceTariff>>;
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
  netAmount: string;
  missing: string[];
  productionEligible: boolean;
  productionBlockers: string[];
  inputHash: string;
  calcId: string;
}
