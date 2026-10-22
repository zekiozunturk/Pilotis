/**
 * Çalışma/dinlenme kural profilleri. Değerler kaynağıyla birlikte tutulur; uygulanabilirlik (hangi personele hangi
 * profil) ve hazır bulunmanın sayılması işletme/hukuk onayına tabidir (R-020, R-029, R-030).
 */
import type { RestProfile } from "./rest";

export interface ProfileDef extends RestProfile { basis: string; status: "SOURCE_FOUND" | "EXPERT_REVIEW" | "APPROVED"; note: string }

export const PROFILES: ProfileDef[] = [
  {
    code: "STCW_MLC", name: "Gemiadamı dinlenme (STCW A-VIII/1 · MLC 2006 Std. A2.3)",
    basis: "STCW Kod A-VIII/1 md.2–3; MLC 2006 Standart A2.3 (5)–(6)", status: "EXPERT_REVIEW",
    note: "Liman içi römorkör/kılavuz botu personeline uygulanabilirliği ve Deniz İş Kanunu (854) ile ilişkisi doğrulanacak",
    minRest24h: 10 * 60, minRest7d: 77 * 60, maxRestPeriods24h: 2, minLongestRest24h: 6 * 60, maxContinuousWork: 14 * 60,
    maxWork24h: null, minContinuousRest7d: null, weeklyNormal: 48 * 60, weeklyMax: null,
    nightStartHour: 20, nightEndHour: 6, maxNightWork: null, nightShiftMinMinutes: 180,
    standbyCountsAsWork: true, trainingCountsAsWork: true, minRestBlock: 60,
  },
  {
    code: "IS_KANUNU", name: "Kara personeli (4857 İş Kanunu)",
    basis: "4857 s. İş Kanunu md.63 (haftalık 45 saat), md.69 (gece 20:00–06:00, en fazla 7,5 saat), md.46 (24 saat kesintisiz hafta tatili); İş Kanununa İlişkin Çalışma Süreleri Yönetmeliği (günde en fazla 11 saat)",
    status: "SOURCE_FOUND", note: "Kıyı operasyon ve ofis personeli için; denkleştirme uygulaması varsa haftalık sınır farklı değerlendirilir",
    minRest24h: null, minRest7d: null, maxRestPeriods24h: null, minLongestRest24h: null, maxContinuousWork: null,
    maxWork24h: 11 * 60, minContinuousRest7d: 24 * 60, weeklyNormal: 45 * 60, weeklyMax: null,
    nightStartHour: 20, nightEndHour: 6, maxNightWork: 7.5 * 60, nightShiftMinMinutes: 180,
    standbyCountsAsWork: true, trainingCountsAsWork: true, minRestBlock: 60,
  },
];

export const profileByCode = (c?: string | null) => PROFILES.find((p) => p.code === c) ?? PROFILES[0];
