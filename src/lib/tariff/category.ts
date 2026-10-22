/**
 * Tarife kategorisi seçimi — gemi tipi, sefer niteliği ve yük durumu AYRI alanlardır;
 * kategori bunlardan türetilir ve gerekçesi kullanıcıya gösterilir.
 */
export const TARIFF_CATEGORIES: Record<string, string> = {
  KABOTAJ: "Kabotaj hattında çalışan gemiler",
  YOLCU_RORO: "Yolcu, transit yük, Ro-Ro, araç taşıyan (car carrier)",
  LINER_KONTEYNER: "Liner konteyner",
  DIGER_YUK: "Diğer yük gemileri",
};

export interface CategoryInput { vesselType?: string | null; isCabotage?: boolean | null; isLinerService?: boolean | null }
export interface CategoryDecision { code: string; reason: string; assumed: boolean }

const RORO = /ro-?ro|ro-?pax|car ?carrier|pctc|pcc|vehicle|araç|yolcu|passenger|feribot|ferry|cruise/i;
const CONTAINER = /container|konteyner/i;

export function categorize(i: CategoryInput): CategoryDecision {
  const t = i.vesselType ?? "";
  if (i.isCabotage === true) return { code: "KABOTAJ", reason: "Sefer kabotaj olarak beyan edildi / doğrulandı", assumed: false };
  const unknownCabotage = i.isCabotage === null || i.isCabotage === undefined;
  const suffix = unknownCabotage ? " — kabotaj değerlendirmesi yapılmadı (varsayım)" : "";
  if (RORO.test(t)) return { code: "YOLCU_RORO", reason: `Gemi tipi "${t}" yolcu/Ro-Ro/araç taşıyıcı grubunda${suffix}`, assumed: unknownCabotage };
  if (CONTAINER.test(t)) {
    if (i.isLinerService === true) return { code: "LINER_KONTEYNER", reason: `Konteyner gemisi, düzenli hat (liner) seferi${suffix}`, assumed: unknownCabotage };
    return { code: "DIGER_YUK", reason: `Konteyner gemisi ancak liner seferi ${i.isLinerService === false ? "değil" : "doğrulanmadı"} → diğer yük${suffix}`, assumed: unknownCabotage || i.isLinerService == null };
  }
  if (!t) return { code: "DIGER_YUK", reason: "Gemi tipi bilinmiyor → diğer yük varsayıldı", assumed: true };
  return { code: "DIGER_YUK", reason: `Gemi tipi "${t}" özel kategorilere girmiyor → diğer yük${suffix}`, assumed: unknownCabotage };
}

export function isContainerOrRoro(vesselType?: string | null): boolean {
  return RORO.test(vesselType ?? "") || CONTAINER.test(vesselType ?? "");
}
