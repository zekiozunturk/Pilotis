/**
 * 2429 sayılı Kanun kapsamındaki ulusal bayram ve genel tatiller.
 * Dini bayram tarihleri her yıl Diyanet takviminden doğrulanmalıdır (verified=false olanlar).
 * fromHour: arife / yarım gün tatillerde tatilin başladığı saat (Europe/Istanbul).
 */
export interface Holiday { date: string; name: string; fromHour?: number; verified: boolean }

const FIXED: [string, string, number?][] = [
  ["01-01", "Yılbaşı"], ["04-23", "Ulusal Egemenlik ve Çocuk Bayramı"], ["05-01", "Emek ve Dayanışma Günü"],
  ["05-19", "Atatürk'ü Anma, Gençlik ve Spor Bayramı"], ["07-15", "Demokrasi ve Millî Birlik Günü"],
  ["08-30", "Zafer Bayramı"], ["10-28", "Cumhuriyet Bayramı arifesi", 13], ["10-29", "Cumhuriyet Bayramı"],
];

const RELIGIOUS: Holiday[] = [
  { date: "2025-03-29", name: "Ramazan Bayramı arifesi", fromHour: 13, verified: false },
  { date: "2025-03-30", name: "Ramazan Bayramı 1. gün", verified: false },
  { date: "2025-03-31", name: "Ramazan Bayramı 2. gün", verified: false },
  { date: "2025-04-01", name: "Ramazan Bayramı 3. gün", verified: false },
  { date: "2025-06-05", name: "Kurban Bayramı arifesi", fromHour: 13, verified: false },
  { date: "2025-06-06", name: "Kurban Bayramı 1. gün", verified: false },
  { date: "2025-06-07", name: "Kurban Bayramı 2. gün", verified: false },
  { date: "2025-06-08", name: "Kurban Bayramı 3. gün", verified: false },
  { date: "2025-06-09", name: "Kurban Bayramı 4. gün", verified: false },
  { date: "2026-03-19", name: "Ramazan Bayramı arifesi", fromHour: 13, verified: false },
  { date: "2026-03-20", name: "Ramazan Bayramı 1. gün", verified: false },
  { date: "2026-03-21", name: "Ramazan Bayramı 2. gün", verified: false },
  { date: "2026-03-22", name: "Ramazan Bayramı 3. gün", verified: false },
  { date: "2026-05-26", name: "Kurban Bayramı arifesi", fromHour: 13, verified: false },
  { date: "2026-05-27", name: "Kurban Bayramı 1. gün", verified: false },
  { date: "2026-05-28", name: "Kurban Bayramı 2. gün", verified: false },
  { date: "2026-05-29", name: "Kurban Bayramı 3. gün", verified: false },
  { date: "2026-05-30", name: "Kurban Bayramı 4. gün", verified: false },
];

export function holidaysFor(year: number): Holiday[] {
  return [...FIXED.map(([md, name, fromHour]) => ({ date: `${year}-${md}`, name, fromHour, verified: true })), ...RELIGIOUS.filter((h) => h.date.startsWith(String(year)))];
}

/** Hizmet anı (UTC) Europe/Istanbul saatine göre tatile denk geliyor mu? (TR: UTC+3, yaz saati yok) */
export function holidayAt(iso: string): Holiday | null {
  const t = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const ymd = t.toISOString().slice(0, 10);
  const h = holidaysFor(t.getUTCFullYear()).find((x) => x.date === ymd);
  if (!h) return null;
  if (h.fromHour !== undefined && t.getUTCHours() < h.fromHour) return null;
  return h;
}
