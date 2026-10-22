/** Bağlantılı durum kümeleri ve izinli geçişler (sunucu tarafında denetlenir). */
export type Role =
  | "SYSTEM_ADMIN" | "BUSINESS_MANAGER" | "OPERATIONS_MANAGER" | "PLANNER" | "SHORE_OPS" | "PILOT"
  | "TUG_MASTER" | "CREW" | "ACCOUNTING" | "TARIFF_OFFICER" | "CUSTOMER" | "BILLING_PARTY" | "AUDITOR";

interface Transition { from: string; to: string; roles: Role[]; requires?: string[] }

export const OP_STATUS_TRANSITIONS: Transition[] = [
  { from: "READY", to: "TRANSIT", roles: ["TUG_MASTER", "PILOT", "SHORE_OPS", "OPERATIONS_MANAGER"] },
  { from: "TRANSIT", to: "ON_SITE", roles: ["TUG_MASTER", "PILOT", "SHORE_OPS", "OPERATIONS_MANAGER"] },
  { from: "ON_SITE", to: "STARTED", roles: ["TUG_MASTER", "PILOT", "SHORE_OPS", "OPERATIONS_MANAGER"], requires: ["declarationChecked"] },
  { from: "STARTED", to: "PAUSED", roles: ["TUG_MASTER", "PILOT", "SHORE_OPS", "OPERATIONS_MANAGER"], requires: ["pauseReason"] },
  { from: "PAUSED", to: "STARTED", roles: ["TUG_MASTER", "PILOT", "SHORE_OPS", "OPERATIONS_MANAGER"] },
  { from: "STARTED", to: "COMPLETED", roles: ["TUG_MASTER", "PILOT", "SHORE_OPS", "OPERATIONS_MANAGER"] },
  { from: "STARTED", to: "PARTIAL", roles: ["SHORE_OPS", "OPERATIONS_MANAGER"], requires: ["incompleteReason"] },
  { from: "READY", to: "CANCELLED", roles: ["OPERATIONS_MANAGER", "SHORE_OPS"], requires: ["cancelReason"] },
  { from: "TRANSIT", to: "CANCELLED", roles: ["OPERATIONS_MANAGER", "SHORE_OPS"], requires: ["cancelReason"] },
  { from: "ON_SITE", to: "CANCELLED", roles: ["OPERATIONS_MANAGER", "SHORE_OPS"], requires: ["cancelReason"] },
];

export const ACCRUAL_TRANSITIONS: Transition[] = [
  { from: "AWAITING_CALC", to: "IN_REVIEW", roles: ["ACCOUNTING", "OPERATIONS_MANAGER"] },
  // görev ayrılığı: hazırlayan ≠ onaylayan (sunucu ayrıca kontrol eder)
  { from: "IN_REVIEW", to: "APPROVED", roles: ["BUSINESS_MANAGER"], requires: ["productionEligible"] },
  { from: "APPROVED", to: "DISPUTED", roles: ["ACCOUNTING", "BUSINESS_MANAGER"] },
  { from: "DISPUTED", to: "CORRECTED", roles: ["BUSINESS_MANAGER"], requires: ["newVersion"] },
];

export const CANCEL_REASONS = [
  ["WEATHER", "Hava / deniz koşulları"],
  ["CUSTOMER_CANCEL", "Müşteri iptali"],
  ["VESSEL_NOT_READY", "Gemi hazır değil"],
  ["FACILITY_NOT_READY", "Tesis hazır değil"],
  ["DECLARATION_MISMATCH", "Beyana aykırılık"],
  ["SAFETY", "Emniyet uygunsuzluğu"],
  ["TECHNICAL", "Teknik arıza"],
  ["AUTHORITY_ORDER", "Yetkili makam talimatı"],
  ["RESOURCE_SHORTAGE", "Kaynak yetersizliği"],
  ["OTHER", "Diğer (açıklamalı)"],
] as const;

export function canTransition(set: Transition[], from: string, to: string, roles: Role[], ctx: Record<string, unknown> = {}):
  { ok: true } | { ok: false; reason: string } {
  const t = set.find((x) => x.from === from && x.to === to);
  if (!t) return { ok: false, reason: `${from} → ${to} geçişi tanımlı değil` };
  if (!roles.some((r) => t.roles.includes(r) || r === "SYSTEM_ADMIN")) return { ok: false, reason: "Bu geçiş için yetkiniz yok" };
  const missing = (t.requires ?? []).filter((k) => !ctx[k]);
  if (missing.length) return { ok: false, reason: `Eksik koşul: ${missing.join(", ")}` };
  return { ok: true };
}
