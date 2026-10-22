"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { analyticsAccess } from "@/lib/analytics/access";
import type { ReportDef } from "@/lib/analytics/report";
import { computeReport } from "./compute";

export type RState = { ok: boolean; message: string; id?: string; version?: number; conflict?: { theirs: ReportDef; version: number; by: string; at: string } } | null;
const MANAGERS = ["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"];

async function guard(scope: string) {
  const role = await currentRole();
  if (!analyticsAccess(role).reports) throw new Error(`Rapor oluşturma yetkiniz yok (${ROLE_LABELS[role]})`);
  if (scope === "CORPORATE" && !MANAGERS.includes(role)) throw new Error("Kurumsal rapor yalnız yönetici tarafından paylaşılabilir");
  if (scope === "TEAM" && ![...MANAGERS, "PLANNER", "ACCOUNTING"].includes(role)) throw new Error("Ekip paylaşımı için yetkiniz yok");
  return role;
}
/** Çift tıklama / bağlantı nedeniyle yeniden gönderim mükerrer kayıt üretmez */
async function seen(requestId: string) {
  const [x] = await db.select().from(s.auditLog).where(and(eq(s.auditLog.entity, "request"), eq(s.auditLog.entityId, requestId)));
  return x?.after as { id: string; version: number } | undefined;
}

export async function saveReport(input: { id?: string; kind: "TEMPLATE" | "VIEW"; name: string; scope: string; def: ReportDef; filters: string; expectedVersion?: number; requestId: string; force?: boolean }): Promise<RState> {
  try {
    const role = await guard(input.scope);
    const prev = await seen(input.requestId);
    if (prev) return { ok: true, message: "Kaydedildi (tekrar gönderim algılandı — yeni kayıt oluşturulmadı)", id: prev.id, version: prev.version };
    if (!input.name.trim()) return { ok: false, message: "Rapor adı zorunlu" };
    if (input.id) {
      const [cur] = await db.select().from(s.reports).where(eq(s.reports.id, input.id));
      if (!cur) return { ok: false, message: "Rapor bulunamadı" };
      if (cur.kind === "SNAPSHOT") return { ok: false, message: "Sabit nüsha değiştirilemez — yeni nüsha oluşturun" };
      if (cur.ownerRole !== role && !MANAGERS.includes(role)) return { ok: false, message: "Bu raporu yalnız sahibi veya yönetici değiştirebilir" };
      if (!input.force && input.expectedVersion != null && cur.version !== input.expectedVersion) {
        return { ok: false, message: `Çakışma: rapor siz açtıktan sonra ${cur.owner} tarafından değiştirildi (sürüm ${cur.version}). Alanları karşılaştırıp karar verin.`, conflict: { theirs: cur.definition as ReportDef, version: cur.version, by: cur.owner, at: cur.updatedAt.toISOString() } };
      }
      const [row] = await db.update(s.reports).set({ name: input.name, scope: input.scope, definition: input.def, filters: input.kind === "VIEW" ? input.filters : null, version: cur.version + 1, updatedAt: new Date() }).where(eq(s.reports.id, input.id)).returning();
      await db.insert(s.auditLog).values([{ entity: "report", entityId: row.id, action: "UPDATE", before: { definition: cur.definition, version: cur.version } as object, after: { definition: input.def, version: row.version } as object, actorId: role }, { entity: "request", entityId: input.requestId, action: "DONE", after: { id: row.id, version: row.version }, actorId: role }]);
      revalidatePath("/analiz/rapor");
      return { ok: true, message: `Sunucuya kaydedildi — sürüm ${row.version}`, id: row.id, version: row.version };
    }
    const [row] = await db.insert(s.reports).values({ kind: input.kind, name: input.name, scope: input.scope, owner: ROLE_LABELS[role], ownerRole: role, definition: input.def, filters: input.kind === "VIEW" ? input.filters : null }).returning();
    await db.insert(s.auditLog).values([{ entity: "report", entityId: row.id, action: "CREATE", after: { kind: row.kind, name: row.name, scope: row.scope } as object, actorId: role }, { entity: "request", entityId: input.requestId, action: "DONE", after: { id: row.id, version: 1 }, actorId: role }]);
    revalidatePath("/analiz/rapor");
    return { ok: true, message: `Sunucuya kaydedildi (${input.kind === "VIEW" ? "kayıtlı görünüm" : "rapor şablonu"})`, id: row.id, version: 1 };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function copyReport(id: string): Promise<RState> {
  const role = await currentRole();
  const [cur] = await db.select().from(s.reports).where(eq(s.reports.id, id));
  if (!cur) return { ok: false, message: "Rapor bulunamadı" };
  const [row] = await db.insert(s.reports).values({ kind: "TEMPLATE", name: `${cur.name} (kopya)`, scope: "PERSONAL", owner: ROLE_LABELS[role], ownerRole: role, definition: cur.definition, sourceId: cur.id }).returning();
  await db.insert(s.auditLog).values({ entity: "report", entityId: row.id, action: "COPY", after: { from: cur.id }, actorId: role });
  revalidatePath("/analiz/rapor");
  return { ok: true, message: "Bağımsız kopya oluşturuldu (yeni kimlik, taslak)", id: row.id, version: 1 };
}

export async function archiveReport(id: string): Promise<RState> {
  const role = await currentRole();
  const [cur] = await db.select().from(s.reports).where(eq(s.reports.id, id));
  if (!cur) return { ok: false, message: "Rapor bulunamadı" };
  if (cur.kind === "SNAPSHOT") return { ok: false, message: "Sabit nüsha silinemez" };
  if (cur.ownerRole !== role && !MANAGERS.includes(role)) return { ok: false, message: "Yalnız sahibi veya yönetici kaldırabilir" };
  await db.delete(s.reportSchedules).where(eq(s.reportSchedules.reportId, id));
  await db.delete(s.reports).where(eq(s.reports.id, id));
  await db.insert(s.auditLog).values({ entity: "report", entityId: id, action: "DELETE", before: { name: cur.name, definition: cur.definition } as object, actorId: role });
  revalidatePath("/analiz/rapor");
  return { ok: true, message: "Rapor kaldırıldı (denetim kaydında saklanıyor)" };
}

export async function createSnapshot(input: { name: string; scope: string; def: ReportDef; filters: string; requestId: string; sourceId?: string }): Promise<RState> {
  try {
    const role = await guard(input.scope);
    const prev = await seen(input.requestId);
    if (prev) return { ok: true, message: "Nüsha zaten oluşturuldu (tekrar gönderim)", id: prev.id };
    const c = await computeReport(input.def, input.filters);
    const reportNo = `NSH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const snapshot = { reportNo, generatedAt: new Date().toISOString(), columns: c.out.columns, rows: c.out.rows, totals: c.out.totals, note: c.out.note, meta: c.meta, finance: c.a.access.finance };
    const [row] = await db.insert(s.reports).values({ kind: "SNAPSHOT", name: input.name || input.def.title, scope: input.scope, owner: ROLE_LABELS[role], ownerRole: role, definition: input.def, filters: input.filters, snapshot, sourceId: input.sourceId ?? null }).returning();
    await db.insert(s.auditLog).values([{ entity: "report", entityId: row.id, action: "SNAPSHOT", after: { reportNo, rows: c.out.rows.length } as object, actorId: role }, { entity: "request", entityId: input.requestId, action: "DONE", after: { id: row.id, version: 1 }, actorId: role }]);
    revalidatePath("/analiz/rapor");
    return { ok: true, message: `Sabit nüsha ${reportNo} oluşturuldu — veri sonradan değişse de bu nüsha değişmez`, id: row.id };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function createSchedule(input: { reportId: string; frequency: string; at: string; weekday: number | null; recipients: string; format: string; dataScope: string }): Promise<RState> {
  const role = await currentRole();
  if (!MANAGERS.includes(role) && role !== "ACCOUNTING" && role !== "PLANNER") return { ok: false, message: "Zamanlanmış rapor tanımlama yetkiniz yok" };
  const [rep] = await db.select().from(s.reports).where(eq(s.reports.id, input.reportId));
  if (!rep || rep.kind === "SNAPSHOT") return { ok: false, message: "Zamanlama için kayıtlı bir şablon/görünüm seçin" };
  if (!/^\d{2}:\d{2}$/.test(input.at)) return { ok: false, message: "Saat SS:DD biçiminde olmalı" };
  const recipients = input.recipients.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => { const [email, r] = x.split("|").map((y) => y.trim()); return { email, role: r || "OPERATIONS_MANAGER" }; });
  if (!recipients.length || recipients.some((r) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email))) return { ok: false, message: "Alıcı e-posta adreslerini kontrol edin (biçim: ad@firma.com|ROL)" };
  const [row] = await db.insert(s.reportSchedules).values({ reportId: rep.id, frequency: input.frequency, at: input.at, weekday: input.weekday, recipients, format: input.format, dataScope: input.dataScope, createdBy: role }).returning();
  await db.insert(s.auditLog).values({ entity: "report_schedule", entityId: row.id, action: "CREATE", after: row as unknown as object, actorId: role });
  revalidatePath("/analiz/rapor");
  return { ok: true, message: "Zamanlanmış rapor tanımlandı — gönderim anında her alıcının yetkisi yeniden kontrol edilir", id: row.id };
}
