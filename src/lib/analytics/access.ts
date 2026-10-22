/** Analiz merkezi yetkileri — ekran ve dışa aktarma aynı kurala tabidir. */
import type { Role } from "../workflow";

export interface AnalyticsAccess {
  any: boolean;           // analiz merkezine giriş
  finance: boolean;       // tahakkuk, fatura, tahsilat, gelir dağıtımı
  personCost: boolean;    // bordro / bireysel maliyet (hassas)
  costs: boolean;         // maliyet ve sonuç analizi (toplulaştırılmış)
  people: "ALL" | "TEAM" | "SELF" | "NONE";
  fleet: boolean; planning: boolean; safety: boolean; reports: boolean;
  label: string;
}
const NONE: AnalyticsAccess = { any: false, finance: false, personCost: false, costs: false, people: "NONE", fleet: false, planning: false, safety: false, reports: false, label: "Erişim yok" };

export function analyticsAccess(role: Role): AnalyticsAccess {
  switch (role) {
    case "SYSTEM_ADMIN":
    case "BUSINESS_MANAGER": return { any: true, finance: true, personCost: true, costs: true, people: "ALL", fleet: true, planning: true, safety: true, reports: true, label: "Yönetici — tüm finansal ve operasyonel analizler" };
    case "OPERATIONS_MANAGER": return { any: true, finance: true, personCost: false, costs: true, people: "ALL", fleet: true, planning: true, safety: true, reports: true, label: "Operasyon yöneticisi — finans dahil, bireysel maliyet hariç" };
    case "AUDITOR": return { any: true, finance: true, personCost: false, costs: true, people: "ALL", fleet: true, planning: true, safety: true, reports: true, label: "Denetçi — salt okunur" };
    case "ACCOUNTING": return { any: true, finance: true, personCost: true, costs: true, people: "NONE", fleet: false, planning: false, safety: false, reports: true, label: "Muhasebe — tahakkuk, fatura, mutabakat ve maliyet" };
    case "PLANNER": return { any: true, finance: false, personCost: false, costs: false, people: "ALL", fleet: true, planning: true, safety: true, reports: true, label: "Planlamacı — kaynak, vardiya ve uygunluk (finans hariç)" };
    case "SHORE_OPS": return { any: true, finance: false, personCost: false, costs: false, people: "ALL", fleet: true, planning: true, safety: false, reports: false, label: "Kıyı operasyon — kaynak ve iş akışı" };
    case "TUG_MASTER": return { any: true, finance: false, personCost: false, costs: false, people: "TEAM", fleet: false, planning: false, safety: true, reports: false, label: "Römorkör kaptanı — yetkili olduğu ekip ve görevler" };
    case "PILOT":
    case "CREW": return { any: true, finance: false, personCost: false, costs: false, people: "SELF", fleet: false, planning: false, safety: true, reports: false, label: "Personel — kendi görev ve çalışma kayıtları" };
    default: return NONE;
  }
}

export const TABS = [
  { href: "/analiz", label: "Yönetici özeti", need: (a: AnalyticsAccess) => a.any && a.people !== "SELF" && a.people !== "TEAM" },
  { href: "/analiz/personel", label: "Personel", need: (a: AnalyticsAccess) => a.people !== "NONE" },
  { href: "/analiz/ekip", label: "Ekip ve vardiya", need: (a: AnalyticsAccess) => a.people === "ALL" || a.people === "TEAM" },
  { href: "/analiz/romorkor", label: "Römorkör", need: (a: AnalyticsAccess) => a.fleet },
  { href: "/analiz/finans", label: "Fatura ve tahakkuk", need: (a: AnalyticsAccess) => a.finance },
  { href: "/analiz/plan", label: "Plan–gerçekleşen", need: (a: AnalyticsAccess) => a.planning },
  { href: "/analiz/is-yuku", label: "İş yükü dengesi", need: (a: AnalyticsAccess) => a.people === "ALL" },
  { href: "/analiz/bekleme", label: "Bekleme ve kayıp zaman", need: (a: AnalyticsAccess) => a.planning },
  { href: "/analiz/emniyet", label: "Emniyet ve yorgunluk", need: (a: AnalyticsAccess) => a.safety },
  { href: "/analiz/rapor", label: "Rapor oluşturucu", need: (a: AnalyticsAccess) => a.reports },
] as const;
