/** Beyan alanları ve değişiklik etki analizi. Eski beyan silinmez; her değişiklik yeni sürümdür. */
export interface Declaration {
  gt?: number | null;
  engine?: string | null;        // çalışıyor | arızalı | makinesiz
  rudder?: string | null;
  thrusters?: string | null;
  cargoCondition?: string | null; // LADEN | BALLAST | EMPTY_NOT_CLEANED | GAS_FREE | UNKNOWN
  dgClass?: string | null;
  unNumber?: string | null;
  gasFreeCert?: boolean | null;
  draft?: number | null;
  isCabotage?: boolean | null;     // sefer niteliği — tarife kategorisini belirler
  isLinerService?: boolean | null; // düzenli hat (liner) seferi
  note?: string | null;
}

export const DECL_FIELDS: { key: keyof Declaration; label: string; critical: boolean; affects: string[] }[] = [
  { key: "gt", label: "GT", critical: true, affects: ["Tarife kademesi / fiyat", "Talepname", "Fatura muhatabı onayı", "Römorkör ihtiyacı"] },
  { key: "engine", label: "Ana makine", critical: true, affects: ["Makinesiz çekilme artırımı (R-006)", "Römorkör ihtiyacı", "Risk değerlendirmesi", "Fatura muhatabı onayı"] },
  { key: "rudder", label: "Dümen", critical: true, affects: ["Römorkör ihtiyacı", "Risk değerlendirmesi"] },
  { key: "thrusters", label: "Pervaneler / thruster", critical: false, affects: ["Römorkör ihtiyacı"] },
  { key: "cargoCondition", label: "Yük durumu", critical: true, affects: ["Tehlike değerlendirmesi", "Artırım/indirim", "Fatura muhatabı onayı"] },
  { key: "dgClass", label: "Tehlikeli yük sınıfı", critical: true, affects: ["Tehlikeli yük artırımı", "Risk değerlendirmesi", "Fatura muhatabı onayı"] },
  { key: "unNumber", label: "UN numarası", critical: true, affects: ["Risk değerlendirmesi"] },
  { key: "gasFreeCert", label: "Gas-free belgesi", critical: true, affects: ["Tanker kuralları (R-014)", "Gerekli belgeler"] },
  { key: "draft", label: "Su çekimi", critical: false, affects: ["Planlama"] },
  { key: "isCabotage", label: "Kabotaj seferi", critical: true, affects: ["Tarife kategorisi / fiyat", "Fatura muhatabı onayı"] },
  { key: "isLinerService", label: "Liner (düzenli hat) seferi", critical: true, affects: ["Tarife kategorisi / fiyat", "Fatura muhatabı onayı"] },
];

export interface FieldChange { key: string; label: string; from: unknown; to: unknown; critical: boolean; affects: string[] }
export interface Impact { changes: FieldChange[]; requiresReapproval: boolean; affected: string[] }

const norm = (v: unknown) => (v === undefined || v === "" ? null : v);

export function declarationImpact(prev: Declaration | null | undefined, next: Declaration): Impact {
  const changes: FieldChange[] = [];
  for (const f of DECL_FIELDS) {
    const a = norm(prev?.[f.key]);
    const b = norm(next[f.key]);
    if (b === null) continue; // yeni sürümde girilmemiş alan "değişti" sayılmaz
    if (a !== b) changes.push({ key: f.key, label: f.label, from: a, to: b, critical: f.critical, affects: f.affects });
  }
  return {
    changes,
    requiresReapproval: changes.some((c) => c.critical && c.from !== null),
    affected: [...new Set(changes.flatMap((c) => c.affects))],
  };
}

/** Müşteri beyanında eksik olan ve paket/hesap için gereken bilgiler */
export function missingInfo(d: Declaration, vesselType?: string | null): string[] {
  const m: string[] = [];
  if (d.gt === null || d.gt === undefined) m.push("GT (tonilato belgesi)");
  if (!d.engine) m.push("Ana makine durumu");
  if (!d.cargoCondition || d.cargoCondition === "UNKNOWN") m.push("Yük durumu");
  const tanker = /tanker/i.test(vesselType ?? "");
  if (tanker && d.cargoCondition === "GAS_FREE" && !d.gasFreeCert) m.push("Gas-free belgesi");
  if (d.dgClass && !d.unNumber) m.push("UN numarası");
  return m;
}
