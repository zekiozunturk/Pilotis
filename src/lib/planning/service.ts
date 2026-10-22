import "server-only";
import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { evaluate, whatIf, type Interval, type Violation, type Evaluation } from "./rest";
import { profileByCode } from "./profiles";

const DAY = 86_400_000;
export type Person = typeof s.personnel.$inferSelect;

export async function personIntervals(personnelId: string, from: number, to: number, excludeShiftId?: string): Promise<Interval[]> {
  const lo = new Date(from - 8 * DAY), hi = new Date(to + 8 * DAY);
  const sh = await db.select().from(s.shifts).where(and(eq(s.shifts.personnelId, personnelId), ne(s.shifts.status, "CANCELLED"), lt(s.shifts.startAt, hi), gte(s.shifts.endAt, lo))).orderBy(asc(s.shifts.startAt));
  const as = await db.select({ a: s.assignments, ref: s.operations.ref }).from(s.assignments).innerJoin(s.operations, eq(s.operations.id, s.assignments.operationId))
    .where(and(eq(s.assignments.personnelId, personnelId), lt(s.assignments.from, hi), gte(s.assignments.to, lo)));
  const linkedOps = new Set(sh.map((x) => x.operationId).filter(Boolean));
  return [
    ...sh.filter((x) => x.id !== excludeShiftId).map((x) => ({ id: x.id, start: x.startAt.getTime(), end: x.endAt.getTime(), category: x.category, label: x.note ?? labelOf(x.category) })),
    // vardiyası olmayan operasyon atamaları da çalışma sayılır
    ...as.filter(({ a }) => !linkedOps.has(a.operationId)).map(({ a, ref }) => ({ id: a.id, start: a.from.getTime(), end: a.to.getTime(), category: "WORK" as const, label: ref })),
  ];
}

export const labelOf = (c: string) => ({ WORK: "Görev", STANDBY: "Hazır bulunma", TRAINING: "Eğitim", LEAVE: "İzin" } as Record<string, string>)[c] ?? c;

export async function certIssues(personnelId: string, at: number): Promise<Violation[]> {
  const certs = await db.select().from(s.certificates).where(eq(s.certificates.personnelId, personnelId));
  const out: Violation[] = [];
  if (!certs.length) out.push({ code: "NO_CERT", severity: "WARNING", ruleRef: "Yeterlik", message: "Kayıtlı yeterlik belgesi yok" });
  for (const c of certs) {
    if (c.expiresAt && c.expiresAt.getTime() < at) out.push({ code: "CERT_EXPIRED", severity: "ERROR", ruleRef: "Yeterlik", message: `${c.name} (${c.number ?? "—"}) süresi ${c.expiresAt.toLocaleDateString("tr-TR")} tarihinde dolmuş` });
    else if (c.expiresAt && c.expiresAt.getTime() < at + 30 * DAY) out.push({ code: "CERT_EXPIRING", severity: "WARNING", ruleRef: "Yeterlik", message: `${c.name} ${c.expiresAt.toLocaleDateString("tr-TR")} tarihinde doluyor` });
  }
  return out;
}

export interface PersonBoard { person: Person; intervals: (Interval & { exception?: boolean; status?: string; operationRef?: string | null })[]; evaluation: Evaluation; certs: Violation[] }

export async function weekBoard(weekStartMs: number): Promise<PersonBoard[]> {
  const to = weekStartMs + 7 * DAY;
  const people = await db.select().from(s.personnel).where(eq(s.personnel.active, true)).orderBy(asc(s.personnel.unit), asc(s.personnel.crewRole));
  const sh = await db.select({ x: s.shifts, ref: s.operations.ref }).from(s.shifts).leftJoin(s.operations, eq(s.operations.id, s.shifts.operationId))
    .where(and(ne(s.shifts.status, "CANCELLED"), lt(s.shifts.startAt, new Date(to)), gte(s.shifts.endAt, new Date(weekStartMs))));
  const out: PersonBoard[] = [];
  for (const p of people) {
    const ivs = await personIntervals(p.id, weekStartMs, to);
    const evaluation = evaluate(ivs, profileByCode(p.workProfile), weekStartMs, to);
    const vis = sh.filter((r) => r.x.personnelId === p.id).map(({ x, ref }) => ({ id: x.id, start: x.startAt.getTime(), end: x.endAt.getTime(), category: x.category, label: x.note ?? labelOf(x.category), exception: !!x.exception, status: x.status, operationRef: ref }));
    out.push({ person: p, intervals: vis, evaluation, certs: await certIssues(p.id, to) });
  }
  return out;
}

export interface CheckResult { ok: boolean; violations: Violation[]; warnings: Violation[]; metricsAfter: Evaluation["metrics"] }

/** Kaydetmeden önce kontrol: yeni kayıt kişinin kurallarını bozar mı? */
export async function checkInterval(person: Person, add: Interval, excludeShiftId?: string): Promise<CheckResult> {
  const from = add.start - 7 * 86_400_000, to = add.end + 7 * 86_400_000;
  const existing = await personIntervals(person.id, from, to, excludeShiftId);
  const r = whatIf(existing, add, profileByCode(person.workProfile), from, to);
  const certs = add.category === "LEAVE" ? [] : await certIssues(person.id, add.end);
  const violations = [...r.newViolations, ...certs.filter((c) => c.severity === "ERROR")];
  const warnings = [...r.after.violations.filter((v) => v.severity === "WARNING" && (v.windowStart === undefined || true)), ...certs.filter((c) => c.severity === "WARNING")];
  return { ok: violations.length === 0, violations, warnings, metricsAfter: r.after.metrics };
}

export interface ExceptionInput { authorizedBy: string; basis: string; reason: string; compensation: string }

/**
 * Vardiya kaydı — kişinin satırı kilitlenir (FOR UPDATE), kontrol işlem içinde tekrarlanır:
 * iki planlamacı aynı kişiyi eşzamanlı çakışan görevlere atayamaz.
 */
export async function saveShift(input: { personnelId: string; category: Interval["category"]; start: Date; end: Date; assetId?: string | null; operationId?: string | null; note?: string | null; createdBy: string; exception?: ExceptionInput | null }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM personnel WHERE id = ${input.personnelId} FOR UPDATE`);
    const [person] = await tx.select().from(s.personnel).where(eq(s.personnel.id, input.personnelId));
    if (!person) throw new Error("Personel bulunamadı");
    if (input.end <= input.start) throw new Error("Bitiş başlangıçtan sonra olmalı");
    if (input.end.getTime() - input.start.getTime() > 3 * 86_400_000 && input.category !== "LEAVE") throw new Error("Tek kayıt 72 saati aşamaz (izin hariç)");
    const chk = await checkInterval(person, { start: input.start.getTime(), end: input.end.getTime(), category: input.category, label: input.note ?? labelOf(input.category) });
    const hardOverlap = chk.violations.some((v) => v.code === "OVERLAP");
    if (hardOverlap) throw new Error(`Çakışma: ${chk.violations.find((v) => v.code === "OVERLAP")!.message}`);
    if (!chk.ok && !input.exception) return { saved: false as const, check: chk };
    const [row] = await tx.insert(s.shifts).values({
      personnelId: input.personnelId, category: input.category, startAt: input.start, endAt: input.end, assetId: input.assetId || null,
      operationId: input.operationId || null, note: input.note || null, createdBy: input.createdBy,
      exception: chk.ok ? null : { ...input.exception, violations: chk.violations.map((v) => v.message), at: new Date().toISOString() },
    }).returning();
    await tx.insert(s.auditLog).values({ entity: "shift", entityId: row.id, action: chk.ok ? "CREATE" : "CREATE_WITH_EXCEPTION", after: row as unknown as object, actorId: input.createdBy, reason: input.exception?.reason ?? null });
    return { saved: true as const, id: row.id, check: chk };
  });
}

/** Bu ay kullanılan acil durum istisnası sayısı (olağan iş yükü için sınırsız kullanılamaz) */
export async function exceptionsThisMonth(): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 3 * 3600_000);
  const r = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM shifts WHERE exception IS NOT NULL AND created_at >= ${start}`);
  return r.rows[0].n;
}
export const EXCEPTION_MONTHLY_LIMIT = 3;

export interface Candidate { person: Person; ok: boolean; violations: Violation[]; warnings: Violation[]; weekHours: number; nightShifts: number; nightHours: number; reason: string }

/** Operasyon için ekip önerisi: önce uygunluk, sonra adil dağılım (gece görevi ve haftalık saat) */
export async function candidatesFor(start: number, end: number, crewRole?: string | null): Promise<Candidate[]> {
  const people = await db.select().from(s.personnel).where(eq(s.personnel.active, true));
  const out: Candidate[] = [];
  for (const p of people.filter((x) => !crewRole || x.crewRole === crewRole)) {
    const chk = await checkInterval(p, { start, end, category: "WORK", label: "Aday görev" });
    const wk = evaluate(await personIntervals(p.id, start - 7 * DAY, end), profileByCode(p.workProfile), start - 7 * DAY, end).metrics;
    const reason = chk.ok
      ? `Uygun: ${chk.warnings.some((w) => w.code === "CERT_EXPIRING") ? "belge yakında doluyor; " : "belgeler geçerli; "}çakışma yok; dinlenme kontrolü olumlu`
      : `Uygun değil: ${chk.violations.map((v) => v.message).join(" · ")}`;
    out.push({ person: p, ok: chk.ok, violations: chk.violations, warnings: chk.warnings, weekHours: Math.round(wk.workMinutes / 6) / 10, nightShifts: wk.nightShifts, nightHours: Math.round(wk.nightMinutes / 6) / 10, reason });
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || a.nightShifts - b.nightShifts || a.weekHours - b.weekHours);
}
