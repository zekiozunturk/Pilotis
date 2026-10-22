import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { OPERATOR } from "@/data/catalog";

export const LEAD_KEY = "portal.minLeadHours";
/** Müşteri talebinde istenen zamanın en az kaç saat sonrası olacağı (ayarlardan; varsayılan 6 saat — R-011) */
export async function minLeadHours(): Promise<number> {
  const [r] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, LEAD_KEY));
  const v = Number(r?.value);
  return Number.isFinite(v) && v >= 0 ? v : 6;
}
export const earliestAllowed = (hours: number, now = Date.now()) => new Date(now + hours * 3_600_000);
/** Erken talep hatası; null = uygun */
export function leadTimeProblem(when: Date, hours: number, now = Date.now()): string | null {
  if (Number.isNaN(when.getTime())) return "İstenen tarih/saat okunamadı";
  if (when.getTime() < now) return "İstenen zaman geçmişte olamaz";
  if (when.getTime() < now + hours * 3_600_000) {
    const e = earliestAllowed(hours, now).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
    return `İstenen zaman en az ${hours} saat sonrası olmalı (en erken ${e}). Daha yakın zamanlı acil işler için operasyon hattını arayın: ${OPERATOR.phone}`;
  }
  return null;
}
/** datetime-local için "yyyy-mm-ddThh:mm" (İstanbul saati) */
export const toLocalInput = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
