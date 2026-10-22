"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import type { Role } from "@/lib/workflow";
import { checkInterval, saveShift, candidatesFor, exceptionsThisMonth, EXCEPTION_MONTHLY_LIMIT, labelOf } from "@/lib/planning/service";
import { recordAudit } from "@/lib/ops";
import type { Violation } from "@/lib/planning/rest";
import { notify } from "@/lib/notify";

export type PlanState = {
  ok: boolean; message: string; at?: string; saved?: boolean; needsException?: boolean;
  violations?: Violation[]; warnings?: Violation[];
  metrics?: { workMinutes: number; nightMinutes: number; minRest24h: number | null; minRest7d: number | null };
  candidates?: { id: string; name: string; title: string; ok: boolean; reason: string; weekHours: number; nightShifts: number; nightHours: number; warnings: string[] }[];
} | null;

async function need(roles: Role[]) {
  const r = await currentRole();
  if (r !== "SYSTEM_ADMIN" && !roles.includes(r)) throw new Error(`Bu işlem için yetkiniz yok (${ROLE_LABELS[r]})`);
  return r;
}
const tr = (v: FormDataEntryValue | null) => { const x = String(v ?? ""); return new Date(/[+Z]/.test(x.slice(10)) ? x : `${x}:00+03:00`); };

function parse(f: FormData) {
  const personnelId = String(f.get("personnelId") || "");
  const category = String(f.get("category") || "WORK") as "WORK";
  const start = tr(f.get("start")), end = tr(f.get("end"));
  if (!personnelId) throw new Error("Personel seçin");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Başlangıç ve bitiş gerekli");
  return { personnelId, category, start, end, assetId: String(f.get("assetId") || "") || null, note: String(f.get("note") || "") || null };
}

export async function checkShift(_: PlanState, f: FormData): Promise<PlanState> {
  try {
    await need(["PLANNER", "OPERATIONS_MANAGER"]);
    const x = parse(f);
    const [person] = await db.select().from(s.personnel).where(eq(s.personnel.id, x.personnelId));
    const chk = await checkInterval(person, { start: x.start.getTime(), end: x.end.getTime(), category: x.category, label: labelOf(x.category) });
    return { ok: chk.ok, message: chk.ok ? "Uygun: çakışma yok, dinlenme ve belge kontrolleri olumlu" : `${chk.violations.length} kural ihlali — kaydetmek için yetkili acil durum istisnası gerekir`, violations: chk.violations, warnings: chk.warnings, needsException: !chk.ok, metrics: chk.metricsAfter };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function createShift(_: PlanState, f: FormData): Promise<PlanState> {
  try {
    const role = await need(["PLANNER", "OPERATIONS_MANAGER"]);
    const x = parse(f);
    const withEx = f.get("withException") === "1";
    let exception = null;
    if (withEx) {
      if (!["OPERATIONS_MANAGER", "BUSINESS_MANAGER", "SYSTEM_ADMIN"].includes(role)) return { ok: false, message: "Acil durum istisnasını yalnız operasyon veya işletme yöneticisi onaylayabilir", needsException: true };
      const basis = String(f.get("basis") || "").trim(), reason = String(f.get("reason") || "").trim(), compensation = String(f.get("compensation") || "").trim();
      if (!basis || reason.length < 10 || compensation.length < 5) return { ok: false, message: "İstisna için dayanak (görevlendirme/talimat), gerekçe ve telafi dinlenmesi planı zorunlu", needsException: true };
      const used = await exceptionsThisMonth();
      if (used >= EXCEPTION_MONTHLY_LIMIT && f.get("overLimitAck") !== "on") return { ok: false, message: `Bu ay ${used} istisna kullanıldı (sınır ${EXCEPTION_MONTHLY_LIMIT}). Olağan iş yükü acil durum sayılamaz — devam için sınır aşımını onaylayın`, needsException: true };
      exception = { authorizedBy: role, basis, reason, compensation };
    }
    const r = await saveShift({ ...x, createdBy: role, exception });
    if (!r.saved) return { ok: false, message: "Kaydedilmedi: kural ihlali var", violations: r.check.violations, warnings: r.check.warnings, needsException: true };
    revalidatePath("/planlama");
    return { ok: true, saved: true, message: exception ? "Acil durum istisnasıyla kaydedildi — telafi planı takip edilecek" : "Vardiya kaydedildi", at: new Date().toISOString(), warnings: r.check.warnings };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function cancelShift(_: PlanState, f: FormData): Promise<PlanState> {
  try {
    const role = await need(["PLANNER", "OPERATIONS_MANAGER"]);
    const id = String(f.get("shiftId")); const reason = String(f.get("reason") || "").trim();
    if (!reason) return { ok: false, message: "İptal gerekçesi gerekli" };
    await db.update(s.shifts).set({ status: "CANCELLED" }).where(eq(s.shifts.id, id));
    await recordAudit("shift", id, "CANCEL", null, role, reason);
    revalidatePath("/planlama");
    return { ok: true, message: "Vardiya iptal edildi (kayıt silinmedi)", at: new Date().toISOString() };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function suggestCrew(_: PlanState, f: FormData): Promise<PlanState> {
  try {
    await need(["PLANNER", "OPERATIONS_MANAGER"]);
    const start = tr(f.get("start")), end = tr(f.get("end"));
    if (end <= start) return { ok: false, message: "Bitiş başlangıçtan sonra olmalı" };
    const c = await candidatesFor(start.getTime(), end.getTime(), String(f.get("crewRole") || "") || null);
    return { ok: true, message: `${c.filter((x) => x.ok).length} uygun / ${c.length} aday`, candidates: c.map((x) => ({ id: x.person.id, name: x.person.fullName, title: x.person.title, ok: x.ok, reason: x.reason, weekHours: x.weekHours, nightShifts: x.nightShifts, nightHours: x.nightHours, warnings: x.warnings.map((w) => w.message) })) };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function assignCrew(_: PlanState, f: FormData): Promise<PlanState> {
  try {
    const role = await need(["PLANNER", "OPERATIONS_MANAGER"]);
    const opRef = String(f.get("opRef") || "");
    const [op] = await db.select().from(s.operations).where(eq(s.operations.ref, opRef));
    if (!op) return { ok: false, message: "Operasyon bulunamadı" };
    const x = parse(f);
    const r = await saveShift({ ...x, category: "WORK", operationId: op.id, note: `${opRef} görevi`, createdBy: role });
    if (!r.saved) return { ok: false, message: "Atanamadı: kural ihlali", violations: r.check.violations };
    const [p] = await db.select().from(s.personnel).where(eq(s.personnel.id, x.personnelId));
    await db.insert(s.assignments).values({ operationId: op.id, personnelId: x.personnelId, assetId: p.homeAssetId, roleOnTask: p.title, from: x.start, to: x.end, firm: false });
    if (op.planningStatus === "AWAITING_RESOURCE") await db.update(s.operations).set({ planningStatus: "TENTATIVE" }).where(eq(s.operations.id, op.id));
    await recordAudit("operation", opRef, "ASSIGN_CREW", { personnelId: x.personnelId }, role);
    await notify({ personnelIds: [x.personnelId] }, { kind: "TASK_ASSIGNED", ref: opRef, link: `/operasyonlar/${opRef}#olaylar`, title: `Yeni görev: ${opRef}`, body: `${new Date(x.start).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })} – ${new Date(x.end).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })} · ${p.title}. Görevlerim ekranından ayrıntıya bakın.` });
    revalidatePath("/planlama"); revalidatePath(`/operasyonlar/${opRef}`);
    return { ok: true, saved: true, message: `${p.fullName} ${opRef} görevine geçici olarak atandı`, at: new Date().toISOString() };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
