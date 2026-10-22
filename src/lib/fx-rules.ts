/**
 * Kur tarihi kuralları (saf fonksiyonlar).
 * İşletme kararı (22.10.2026): iş bitiş tarihindeki TCMB döviz satış kuru esas alınır;
 * bitiş günü hafta sonuysa cuma günü 15:30'da yayımlanan bülten kullanılır.
 */
export type DateRule = "COMPLETION_DAY_BULLETIN" | "PREVIOUS_BULLETIN" | "SAME_DAY_BULLETIN";

/** YYYY-MM-DD gününün haftanın günü (0 pazar … 6 cumartesi) */
export function weekday(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** İş bitiş gününe karşılık gelen hedef bülten günü: cumartesi → cuma, pazar → cuma */
export function completionBulletinDate(completionYmd: string): { target: string; reason: string } {
  const w = weekday(completionYmd);
  if (w === 6) return { target: addDays(completionYmd, -1), reason: "İş cumartesi bitti → cuma 15:30 bülteni" };
  if (w === 0) return { target: addDays(completionYmd, -2), reason: "İş pazar bitti → cuma 15:30 bülteni" };
  return { target: completionYmd, reason: "İş bitiş günü 15:30 bülteni" };
}

export interface BulletinPick { bulletinDate: string; provisional: boolean; note: string }

/**
 * Mevcut bülten tarihleri arasından seçim.
 * - Hedef günün bülteni varsa: kesin.
 * - Hedef gün geçmişte ve bülten yoksa (resmî tatil): o günden önceki son bülten, kesin.
 * - Hedef gün bugün/gelecek ve bülten henüz yoksa: son bülten GEÇİCİ (kur kesinleşmeden faturaya esas olmaz).
 */
export function pickBulletin(available: string[], target: string, todayYmd: string, baseReason: string): BulletinPick | null {
  const sorted = [...new Set(available)].sort();
  if (sorted.includes(target)) return { bulletinDate: target, provisional: false, note: baseReason };
  const before = sorted.filter((d) => d < target).at(-1);
  if (target < todayYmd) {
    return before ? { bulletinDate: before, provisional: false, note: `${baseReason}; ${target} için bülten yayımlanmamış (tatil) → son yayımlanan bülten` } : null;
  }
  const latest = sorted.filter((d) => d <= todayYmd).at(-1) ?? before;
  return latest ? { bulletinDate: latest, provisional: true, note: `${baseReason}; ${target} bülteni henüz yayımlanmadı → geçici kur` } : null;
}
