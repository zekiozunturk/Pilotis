/**
 * Üç süre ayrımı:
 *  1) Gerçek olay süresi (bu dosya) — zaman damgaları asla yuvarlanmaz
 *  2) Ücretlendirilen süre — tarife motoru (billedHours)
 *  3) Bildirilecek süre — LYBS alan tanımı doğrulanınca (AK-07)
 * R-001: Başlangıç olayı hizmet türüne göre farklıdır.
 */
export type ServiceKindT = "PILOTAGE" | "TOWAGE" | "MOORING" | "UNMOORING";

export interface Ev {
  type: string;
  occurredAt: string; // ISO
  serviceKind?: string | null;
  assetId?: string | null;
  supersedesId?: string | null;
  id?: string;
}

export const START_EVENT: Record<ServiceKindT, string> = {
  PILOTAGE: "PILOT_BOARDED",
  TOWAGE: "TUG_ALONGSIDE",
  MOORING: "MOORING_START",
  UNMOORING: "MOORING_START",
};
export const END_EVENT: Record<ServiceKindT, string> = {
  PILOTAGE: "PILOT_DISEMBARKED",
  TOWAGE: "SERVICE_END",
  MOORING: "SERVICE_END",
  UNMOORING: "SERVICE_END",
};

export interface ActualDuration {
  start: string | null;
  end: string | null;
  grossMinutes: number | null;
  pauseMinutes: number;
  overlapsDetected: boolean;
}

/** Düzeltilen (supersede edilen) olaylar hesaba girmez ama silinmez. */
export function effectiveEvents(events: Ev[]): Ev[] {
  const superseded = new Set(events.map((e) => e.supersedesId).filter(Boolean) as string[]);
  return events.filter((e) => !e.id || !superseded.has(e.id));
}

export function actualDuration(all: Ev[], kind: ServiceKindT, assetId?: string): ActualDuration {
  const events = effectiveEvents(all)
    .filter((e) => (!e.serviceKind || e.serviceKind === kind) && (!assetId || !e.assetId || e.assetId === assetId))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const start = events.find((e) => e.type === START_EVENT[kind])?.occurredAt ?? null;
  const end = [...events].reverse().find((e) => e.type === END_EVENT[kind])?.occurredAt ?? null;
  let pauseMs = 0;
  let open: number | null = null;
  let overlaps = false;
  for (const e of events) {
    const t = new Date(e.occurredAt).getTime();
    if (e.type === "PAUSE_START") { if (open !== null) overlaps = true; else open = t; }
    if (e.type === "PAUSE_END" && open !== null) { pauseMs += t - open; open = null; }
  }
  const gross = start && end ? (new Date(end).getTime() - new Date(start).getTime()) / 60000 : null;
  return { start, end, grossMinutes: gross !== null && gross >= 0 ? gross : null, pauseMinutes: pauseMs / 60000, overlapsDetected: overlaps };
}
