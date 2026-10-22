/**
 * PILOTIS hesap motoru — deterministik ve açıklanabilir.
 * Aynı girdi + aynı tarife sürümü ⇒ aynı sonuç ve aynı doğrulama kimliği.
 * Ara sonuçlar yuvarlanmaz; yalnız nihai tutar moneyScale'e yuvarlanır.
 */
import Decimal from "decimal.js";
import { createHash } from "node:crypto";
import type {
  CalcInput, CalcResult, RuleTrace, TariffVersionInput, ServiceTariff, GtBand, HourRounding, BollardBand,
} from "./types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const PROD_STATUSES = new Set(["APPROVED", "IN_FORCE"]);
/** Aynı tarihte birden fazla sürüm varsa öncelik (yüksek olan seçilir) */
const STATUS_RANK: Record<string, number> = { IN_FORCE: 5, APPROVED: 4, EXPERT_REVIEW: 3, SOURCE_FOUND: 2, DRAFT: 1, REPEALED: 0 };

export class TariffSelectionError extends Error {}

/**
 * R-009: Sürüm, yıl değil hizmet tarihine göre seçilir.
 * Aynı tarihi kapsayan sürümlerden statüsü en ileri olan seçilir; eşitlik varsa hata (belirsizlik kodlanmaz).
 */
export function selectTariffVersion(versions: TariffVersionInput[], serviceDateIso: string): TariffVersionInput {
  const d = new Date(serviceDateIso).getTime();
  const hits = versions.filter((v) => d >= new Date(v.validFrom).getTime() && d <= new Date(v.validTo).getTime() && v.status !== "REPEALED");
  if (hits.length === 0) throw new TariffSelectionError(`Hizmet tarihi ${serviceDateIso.slice(0, 10)} için geçerli tarife sürümü yok`);
  const top = Math.max(...hits.map((h) => STATUS_RANK[h.status] ?? 0));
  const best = hits.filter((h) => (STATUS_RANK[h.status] ?? 0) === top);
  if (best.length > 1) throw new TariffSelectionError(`Hizmet tarihi için aynı statüde birden fazla sürüm çakışıyor: ${best.map((h) => h.label).join(", ")}`);
  return best[0];
}

export function findBand(bands: GtBand[], gt: number): GtBand | undefined {
  return bands.find((b) => gt >= b.gtFrom && (b.gtTo === null || gt <= b.gtTo));
}

export function bandAmount(band: GtBand, gt: number): Decimal {
  let amt = new Decimal(band.base);
  if (band.perBlock && band.blockSize) {
    const over = Decimal.max(0, new Decimal(gt).minus(band.blockStart ?? band.gtFrom));
    // başlamış her blok tam blok sayılır
    const blocks = over.div(band.blockSize).ceil();
    amt = amt.plus(new Decimal(band.perBlock).times(blocks));
  }
  return amt;
}

export function findBollard(bands: BollardBand[], t: number): BollardBand | undefined {
  // [fromT, toT) — üst sınır bir sonraki aralığa aittir; son aralık açık uçlu
  return bands.find((b) => t >= b.fromT && (b.toT === null || t < b.toT));
}

/** R-015: Gerçek süre korunur; ücret miktarı tarife yuvarlamasıyla üretilir. */
export function billedHours(minutes: number, r: HourRounding): Decimal {
  const h = new Decimal(minutes).div(60);
  let billed: Decimal;
  switch (r.mode) {
    case "CEIL_HOUR": billed = h.ceil(); break;
    case "CEIL_HALF": billed = h.times(2).ceil().div(2); break;
    default: billed = h;
  }
  return Decimal.max(billed, r.minimumHours);
}

export function hashInputs(input: CalcInput, versionId: string): string {
  const canonical = JSON.stringify({ v: versionId, ...input, conditionCodes: [...input.conditionCodes].sort() });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Hizmet tarifesini çözer: kategorili sürümde kategori zorunlu. */
export function resolveService(version: TariffVersionInput, kind: string, category?: string | null): { svc?: ServiceTariff; categoryLabel?: string; error?: string } {
  const def = version.definition;
  if (def.categories && Object.keys(def.categories).length) {
    if (!category) return { error: "Tarife kategorisi belirlenmedi" };
    const c = def.categories[category];
    if (!c) return { error: `Bu sürümde "${category}" kategorisi yok` };
    const svc = c.services[kind as keyof typeof c.services];
    return svc ? { svc, categoryLabel: c.label } : { error: `"${c.label}" kategorisinde ${kind} hizmeti tanımlı değil` };
  }
  const svc = def.services[kind as keyof typeof def.services];
  return svc ? { svc } : { error: `Bu tarife sürümünde ${kind} hizmeti tanımlı değil` };
}

export function calculate(input: CalcInput, version: TariffVersionInput, ruleStatuses: Record<string, string> = {}): CalcResult {
  const rules: RuleTrace[] = [];
  const missing: string[] = [];
  const blockers: string[] = [];
  const def = version.definition;
  const inputHash = hashInputs(input, version.id);
  const { svc, categoryLabel, error } = resolveService(version, input.serviceKind, input.tariffCategory);

  const base: Omit<CalcResult, "baseAmount" | "netAmount" | "billedQuantity" | "measuredQuantity" | "billedUnits" | "adjustmentRate" | "categoryReason"> = {
    operationRef: input.operationRef,
    serviceKind: input.serviceKind,
    tariffVersionId: version.id,
    tariffLabel: version.label,
    currency: version.currency,
    verifiedInputs: {
      gt: input.gt, measuredMinutes: input.measuredMinutes ?? null, allocatedUnits: input.allocatedUnits, requestedUnits: input.requestedUnits,
      conditionCodes: input.conditionCodes, completion: input.completion, serviceDate: input.serviceDate,
      ...(input.tariffCategory ? { tariffCategory: input.tariffCategory } : {}), ...(input.bollardPullT != null ? { bollardPullT: input.bollardPullT } : {}),
    },
    rules, missing, productionEligible: false, productionBlockers: blockers, inputHash,
    calcId: `CALC-${inputHash.slice(0, 12).toUpperCase()}`,
  };
  const fail = (reason: string) => ({ ...base, categoryReason: reason, baseAmount: "0", measuredQuantity: null, billedQuantity: "0", billedUnits: 0, adjustmentRate: "0", netAmount: "0", productionBlockers: [...blockers, ...missing] });

  if (!svc) { missing.push(error ?? "Hizmet tarifesi yok"); return fail("-"); }

  const byBollard = svc.pricing === "BOLLARD_PULL";
  // Bilinmeyen değer sıfır kabul edilmez
  if (!byBollard && (input.gt === null || input.gt === undefined)) missing.push("Doğrulanmış GT değeri yok");
  if (byBollard && (input.bollardPullT === null || input.bollardPullT === undefined)) missing.push("Römorkör çeki gücü (sertifikalı) yok");
  if (svc.unit === "HOUR" && (input.measuredMinutes === null || input.measuredMinutes === undefined)) missing.push("Gerçekleşen hizmet süresi yok");
  if (missing.length) return fail("Eksik girdi nedeniyle hesaplanamadı");

  let unitAmount: Decimal;
  let categoryReason: string;
  const catText = categoryLabel ? `${categoryLabel}${input.categoryReason ? ` (${input.categoryReason})` : ""} · ` : "";
  if (byBollard) {
    const b = findBollard(svc.bollardBands ?? [], input.bollardPullT as number);
    if (!b) { missing.push(`${input.bollardPullT} t çeki gücü için tarife aralığı yok`); return fail("Çeki gücü aralığı bulunamadı"); }
    unitAmount = new Decimal(b.rate);
    categoryReason = `${catText}Çeki gücü ${input.bollardPullT} t → ${b.fromT}–${b.toT ?? "∞"} t aralığı`;
  } else {
    const rawGt = input.gt as number;
    const gt = svc.gtCap && rawGt > svc.gtCap ? svc.gtCap : rawGt;
    const band = findBand(svc.bands, gt);
    if (!band) { missing.push(`GT ${rawGt} için kademe yok`); return fail("Kademe bulunamadı"); }
    unitAmount = bandAmount(band, gt);
    categoryReason = `${catText}GT ${rawGt}${gt !== rawGt ? ` → tavan ${gt} GT uygulandı` : ""} → kademe ${band.gtFrom}–${band.gtTo ?? "∞"}`;
    if (gt !== rawGt) rules.push({ ruleCode: "R-023", applied: true, description: "GT tavanı", reason: `${svc.gtCap} GT üzeri gemilerde ${svc.gtCap} GT ücreti uygulanır` });
  }
  if (input.categoryAssumed) blockers.push("Tarife kategorisi varsayıma dayanıyor (kabotaj/liner değerlendirmesi gerekli)");

  // Miktar
  let measuredQuantity: string | null = null;
  let qty = new Decimal(1);
  if (svc.unit === "HOUR") {
    const mins = input.measuredMinutes as number;
    measuredQuantity = new Decimal(mins).div(60).toFixed(4);
    qty = billedHours(mins, svc.rounding ?? { mode: "CEIL_HOUR", minimumHours: 1 });
    rules.push({ ruleCode: "R-015", applied: true, description: "Saat kesri yuvarlaması", reason: `Gerçek ${mins} dk → ücretlendirilen ${qty.toString()} saat (${svc.rounding?.mode ?? "CEIL_HOUR"})` });
  }

  // Araç sayısı — R-004 / R-019
  let billedUnits = 1;
  if (input.serviceKind === "TOWAGE" || input.serviceKind === "STANDBY_TUG") {
    billedUnits = input.requestedUnits;
    if (input.allocatedUnits > input.requestedUnits) {
      if (input.extraUnitsWrittenRequest) {
        billedUnits = input.allocatedUnits;
        rules.push({ ruleCode: "R-004", applied: true, description: "İlave römorkör", reason: "Kaptanın yazılı talebi mevcut; ilave römorkör ücretlendirildi" });
      } else {
        rules.push({ ruleCode: "R-004", applied: false, description: "İlave römorkör", reason: `Tahsis ${input.allocatedUnits}, ücretlendirilebilir ${input.requestedUnits}: kaptanın yazılı talebi yok` });
      }
    }
    rules.push({ ruleCode: "R-019", applied: true, description: "Tahsis ≠ ücretlendirme", reason: `Tahsis: ${input.allocatedUnits}, ücretlendirilen: ${billedUnits}` });
  }

  const gross = unitAmount.times(qty).times(billedUnits);

  // R-005: en yüksek artırım ve en yüksek indirim; birlikte ise oran farkı
  const cat = input.tariffCategory ?? null;
  const forService: typeof def.adjustments = [];
  for (const a of def.adjustments.filter((x) => input.conditionCodes.includes(x.code))) {
    if (!a.appliesTo.includes(input.serviceKind)) { rules.push({ ruleCode: a.ruleCode, applied: false, description: a.label, reason: `${a.label} bu hizmete uygulanmaz` }); continue; }
    if (cat && a.excludeCategories?.includes(cat)) { rules.push({ ruleCode: a.ruleCode, applied: false, description: a.label, reason: `${def.categories?.[cat]?.label ?? cat} sütunundaki gemiler bu orandan yararlanamaz` }); continue; }
    if (a.onlyCategories && (!cat || !a.onlyCategories.includes(cat))) { rules.push({ ruleCode: a.ruleCode, applied: false, description: a.label, reason: "Gemi kategorisi bu oranın kapsamında değil" }); continue; }
    forService.push(a);
  }
  const pickMax = (k: "SURCHARGE" | "DISCOUNT") => forService.filter((a) => a.kind === k).sort((x, y) => new Decimal(y.rate).cmp(x.rate));
  const surcharges = pickMax("SURCHARGE");
  const discounts = pickMax("DISCOUNT");
  const topS = surcharges[0];
  const topD = discounts[0];
  surcharges.slice(1).forEach((s) => rules.push({ ruleCode: "R-005", applied: false, description: s.label, reason: `Daha yüksek artırım (${topS.label}) esas alındı` }));
  discounts.slice(1).forEach((d) => rules.push({ ruleCode: "R-005", applied: false, description: d.label, reason: `Daha yüksek indirim (${topD.label}) esas alındı` }));
  let rate = new Decimal(0);
  if (topS) { rate = rate.plus(topS.rate); rules.push({ ruleCode: topS.ruleCode, applied: true, description: topS.label, reason: `+%${new Decimal(topS.rate).times(100)}` }); }
  if (topD) { rate = rate.minus(topD.rate); rules.push({ ruleCode: topD.ruleCode, applied: true, description: topD.label, reason: `-%${new Decimal(topD.rate).times(100)}` }); }
  if (topS && topD) rules.push({ ruleCode: "R-005", applied: true, description: "Artırım ve indirim birlikte", reason: `Oran farkı uygulandı: ${rate.times(100).toString()}%` });

  let amount = gross.times(new Decimal(1).plus(rate));

  // Tamamlanma — R-002 / R-008
  switch (input.completion) {
    case "INCOMPLETE_STARTED_VESSEL_OR_FACILITY_CAUSE":
      amount = amount.times(0.5);
      rules.push({ ruleCode: "R-002", applied: true, description: "Yarım ücret", reason: "Başlamış hizmet gemi/tesis kaynaklı tamamlanamadı" });
      break;
    case "INCOMPLETE_STARTED_OTHER_CAUSE":
      rules.push({ ruleCode: "R-002", applied: false, description: "Yarım ücret", reason: "Tamamlanamama gemi/tesis kaynaklı değil — yetkili değerlendirme gerekli" });
      blockers.push("Tamamlanamama nedeni için yetkili değerlendirme bekleniyor");
      break;
    case "CANCELLED_BEFORE_START":
      amount = new Decimal(0);
      rules.push({ ruleCode: "R-008", applied: true, description: "Başlamadan iptal", reason: "Hizmet başlamadığı için ücret oluşmadı" });
      break;
  }

  if (input.waitingMinutes && input.waitingMinutes > 0) {
    rules.push({ ruleCode: "R-003", applied: false, description: "Bekleme ücreti", reason: `${input.waitingMinutes} dk bekleme kaydedildi; ayrıca ücretlendirilmez` });
  }

  // Üretim uygunluğu
  if (version.isDemo) blockers.push("Tarife sürümü ÖRNEK veridir (isDemo)");
  if (!PROD_STATUSES.has(version.status)) blockers.push(`Tarife sürümü statüsü ${version.status}; onaylı değil`);
  const open = (def.verificationNotes ?? []).filter((n) => !n.resolved);
  if (open.length) blockers.push(`Tarife sürümünde ${open.length} çözülmemiş doğrulama notu var`);
  const used = new Set([...svc.ruleCodes, ...rules.filter((r) => r.applied).map((r) => r.ruleCode)]);
  for (const code of used) {
    const st = ruleStatuses[code];
    if (st && !PROD_STATUSES.has(st)) blockers.push(`${code} kuralı ${st} statüsünde`);
  }

  return {
    ...base,
    categoryReason,
    baseAmount: unitAmount.toFixed(4),
    measuredQuantity,
    billedQuantity: qty.toString(),
    billedUnits,
    adjustmentRate: rate.toString(),
    netAmount: amount.toDecimalPlaces(def.moneyScale).toFixed(def.moneyScale),
    productionEligible: blockers.length === 0,
    productionBlockers: blockers,
  };
}
