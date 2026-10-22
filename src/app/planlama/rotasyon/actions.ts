"use server";
import { revalidatePath } from "next/cache";
import { and, eq, gte, lt, like, ne, inArray, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import type { Role } from "@/lib/workflow";
import { recordAudit } from "@/lib/ops";
import { simulate, validateModel, rotationShifts, teamsOf, type RotationModel } from "@/lib/planning/rotation";
import { evaluate, type Interval } from "@/lib/planning/rest";
import { getRotationModel, ROTATION_KEY } from "@/lib/planning/rotation-store";
import { profileByCode } from "@/lib/planning/profiles";

export type RState = { ok: boolean; message: string; at?: string; details?: string[] } | null;
const MANAGERS: Role[] = ["OPERATIONS_MANAGER", "BUSINESS_MANAGER", "SYSTEM_ADMIN"];
const PLANNERS: Role[] = ["PLANNER", ...MANAGERS];
const now = () => new Date().toISOString();

/** Rotasyon modelini kaydeder (R-033): yalnız operasyon/işletme yöneticisi; önceki model denetim kaydında saklanır */
export async function saveRotation(_: RState, f: FormData): Promise<RState> {
  const role = await currentRole();
  if (!MANAGERS.includes(role)) return { ok: false, message: `Rotasyon modelini yalnız operasyon veya işletme yöneticisi kaydedebilir (${ROLE_LABELS[role]})` };
  let m: RotationModel;
  try { m = JSON.parse(String(f.get("model") || "")); } catch { return { ok: false, message: "Model okunamadı" }; }
  const errs = validateModel(m);
  if (errs.length) return { ok: false, message: "Model geçersiz", details: errs };
  const note = String(f.get("note") || "").trim();
  if (note.length < 5) return { ok: false, message: "Değişiklik notu zorunlu (ör. 'Gece römorkörü 3'e çıkarıldı')" };
  const before = await getRotationModel();
  // Atanmış kişisi olan bir ekip yuvası kaldırılamaz (kadro boşa düşmesin)
  const keys = new Set(teamsOf(m).map((t) => t.key));
  const orphan = await db.select({ id: s.personnel.id, name: s.personnel.fullName, team: s.personnel.rotationTeam }).from(s.personnel).where(isNotNull(s.personnel.rotationTeam));
  const lost = orphan.filter((p) => p.team && !keys.has(p.team));
  if (lost.length) return { ok: false, message: `${lost.length} kişinin ekip yuvası yeni modelde yok — önce ekiplerini değiştirin`, details: lost.slice(0, 8).map((p) => `${p.name} (${p.team})`) };
  const sim = simulate(m, profileByCode("STCW_MLC"));
  await db.insert(s.appSettings).values({ key: ROTATION_KEY, value: m, updatedBy: role })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value: m, updatedBy: role, updatedAt: new Date() } });
  await recordAudit("setting", ROTATION_KEY, "UPDATE", { before: before.saved ? before.model : null, after: m, health: sim.system.score, staffing: sim.staffing }, role, note);
  revalidatePath("/planlama/rotasyon");
  return { ok: true, message: `Model kaydedildi — sağlık ${sim.system.score}/100 (${sim.system.bandLabel}), gerekli kadro ${sim.staffing.total} kişi`, at: now() };
}

/** Kişiyi ekip yuvasına atar; aynı ekipte aynı rol iki kişiyle doldurulamaz */
export async function assignTeam(_: RState, f: FormData): Promise<RState> {
  const role = await currentRole();
  if (!PLANNERS.includes(role)) return { ok: false, message: `Yetkiniz yok (${ROLE_LABELS[role]})` };
  const personnelId = String(f.get("personnelId") || ""), team = String(f.get("team") || "");
  const { model } = await getRotationModel();
  const [p] = await db.select().from(s.personnel).where(eq(s.personnel.id, personnelId));
  if (!p) return { ok: false, message: "Personel bulunamadı" };
  if (team) {
    if (!teamsOf(model).some((t) => t.key === team)) return { ok: false, message: "Ekip modelde yok" };
    if (!model.roles.some((r) => r.code === p.crewRole)) return { ok: false, message: `${p.fullName} için görev rolü (${p.crewRole ?? "—"}) rotasyon rollerinde yok` };
    const [taken] = await db.select({ name: s.personnel.fullName }).from(s.personnel)
      .where(and(eq(s.personnel.rotationTeam, team), eq(s.personnel.crewRole, p.crewRole!), ne(s.personnel.id, p.id), eq(s.personnel.active, true)));
    if (taken) return { ok: false, message: `Bu ekipte ${p.crewRole} yuvası dolu: ${taken.name}` };
  }
  await db.update(s.personnel).set({ rotationTeam: team || null }).where(eq(s.personnel.id, p.id));
  await recordAudit("personnel", p.id, "ROTATION_TEAM", { before: p.rotationTeam, after: team || null }, role);
  revalidatePath("/planlama/rotasyon");
  return { ok: true, message: team ? `${p.fullName} → ${team}` : `${p.fullName} ekipten çıkarıldı`, at: now() };
}

/**
 * Kayıtlı modeli takvime uygular: aralıktaki eski PLANLI rotasyon kayıtları silinir, yenileri üretilir.
 * Kişinin mevcut başka kaydıyla (izin, eğitim, ek görev) çakışan rotasyon vardiyası atlanır ve raporlanır.
 * Model dinlenme ihlali içeriyorsa yalnız yönetici, yazılı risk kabulüyle uygulayabilir (R-033).
 */
export async function applyRotation(_: RState, f: FormData): Promise<RState> {
  const role = await currentRole();
  if (!MANAGERS.includes(role)) return { ok: false, message: `Takvime uygulama yalnız operasyon veya işletme yöneticisi yetkisindedir (${ROLE_LABELS[role]})` };
  const fromStr = String(f.get("from") || ""), weeks = Math.round(Number(f.get("weeks") || 0));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) return { ok: false, message: "Başlangıç tarihi seçin" };
  if (!(weeks >= 1 && weeks <= 12)) return { ok: false, message: "Süre 1–12 hafta olmalı" };
  const from = new Date(`${fromStr}T00:00:00+03:00`), to = new Date(from.getTime() + weeks * 7 * 86_400_000);
  const { model, saved } = await getRotationModel();
  if (!saved) return { ok: false, message: "Önce rotasyon modelini kaydedin" };
  const sim = simulate(model, profileByCode("STCW_MLC"));
  const risk = String(f.get("risk") || "").trim();

  const people = await db.select({ id: s.personnel.id, rotationTeam: s.personnel.rotationTeam }).from(s.personnel)
    .where(and(eq(s.personnel.active, true), isNotNull(s.personnel.rotationTeam)));
  if (!people.length) return { ok: false, message: "Ekiplere atanmış personel yok" };
  const rows = rotationShifts(model, people, from.getTime(), to.getTime());
  // Geçiş kontrolü: yeni vardiyalar mevcut kayıtlarla (önceki model, ek görev, izin) birlikte ilk 2 haftada kural bozuyor mu?
  const DAYMS = 86_400_000;
  const ctx = await db.select().from(s.shifts).where(and(inArray(s.shifts.personnelId, people.map((x) => x.id)), ne(s.shifts.status, "CANCELLED"), lt(s.shifts.startAt, new Date(from.getTime() + 15 * DAYMS)), gte(s.shifts.endAt, new Date(from.getTime() - 8 * DAYMS))));
  const keep = ctx.filter((x) => !(x.status === "PLANNED" && (x.note ?? "").startsWith("Rotasyon") && x.startAt >= from && x.startAt < to));
  const transition: string[] = [];
  const winTo = from.getTime() + Math.min(14, weeks * 7) * DAYMS;
  const key = (v: { code: string; windowStart?: number; windowEnd?: number }) => `${v.code}|${v.windowStart ?? ""}|${v.windowEnd ?? ""}`;
  for (const person of people) {
    const base: Interval[] = keep.filter((x) => x.personnelId === person.id).map((x) => ({ start: x.startAt.getTime(), end: x.endAt.getTime(), category: x.category, label: x.note ?? x.category }));
    const added: Interval[] = rows.filter((r) => r.personnelId === person.id && r.start < winTo + DAYMS && !keep.some((x) => x.personnelId === person.id && x.startAt.getTime() < r.end && x.endAt.getTime() > r.start)).map((r) => ({ start: r.start, end: r.end, category: "WORK" as const, label: r.note }));
    if (!added.length) continue;
    // Yalnız yeni vardiyaların yol açtığı ihlaller: önceki kayıtlarda zaten var olan ihlal geçişe yazılmaz
    const P = profileByCode("STCW_MLC"), lo = from.getTime() - DAYMS;
    const had = new Set(evaluate(base, P, lo, winTo).violations.map(key));
    const err = evaluate([...base, ...added], P, lo, winTo).violations.find((v) => v.severity === "ERROR" && v.code !== "OVERLAP" && !had.has(key(v)) && (v.windowStart === undefined || added.some((a) => a.start < (v.windowEnd ?? v.windowStart!) && a.end > v.windowStart!)));
    if (err) transition.push(`${person.id}: ${err.message}`);
  }
  if ((sim.system.peopleWithErrors > 0 || transition.length > 0) && risk.length < 15) {
    const names = new Map((await db.select({ id: s.personnel.id, n: s.personnel.fullName }).from(s.personnel).where(inArray(s.personnel.id, people.map((x) => x.id)))).map((x) => [x.id, x.n.replace("ÖRNEK ", "")]));
    return { ok: false, message: sim.system.peopleWithErrors > 0
      ? `Model ${sim.system.peopleWithErrors} kişide dinlenme kuralını ihlal ediyor — uygulamak için gerekçeli risk kabulü yazın (en az 15 karakter) veya modeli düzeltin`
      : `Geçiş kontrolü: model kendi içinde uygun, ancak mevcut kayıtlarla birleşince ilk ${Math.min(14, weeks * 7)} günde ${transition.length} kişide ihlal oluşuyor. Başlangıcı kaydırın, ilgili kayıtları düzeltin veya gerekçeli risk kabulü yazın.`,
      details: transition.slice(0, 8).map((t) => { const [id, ...rest] = t.split(": "); return `${names.get(id) ?? id}: ${rest.join(": ")}`; }) };
  }
  const assets = await db.select({ id: s.fleetAssets.id, name: s.fleetAssets.name }).from(s.fleetAssets);
  const assetOf = new Map(assets.map((a) => [a.name, a.id]));

  const result = await db.transaction(async (tx) => {
    const ids = people.map((p) => p.id);
    const removed = await tx.delete(s.shifts).where(and(inArray(s.shifts.personnelId, ids), eq(s.shifts.status, "PLANNED"), like(s.shifts.note, "Rotasyon%"), gte(s.shifts.startAt, from), lt(s.shifts.startAt, to))).returning({ id: s.shifts.id });
    const existing = await tx.select().from(s.shifts).where(and(inArray(s.shifts.personnelId, ids), ne(s.shifts.status, "CANCELLED"), lt(s.shifts.startAt, new Date(to.getTime() + 2 * 86_400_000)), gte(s.shifts.endAt, new Date(from.getTime() - 2 * 86_400_000))));
    const skipped: string[] = [];
    const insert = rows.filter((r) => {
      const clash = existing.find((x) => x.personnelId === r.personnelId && x.startAt.getTime() < r.end && x.endAt.getTime() > r.start);
      if (clash) { skipped.push(`${new Date(r.start + 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ")} · ${r.note} — mevcut kayıt: ${clash.note ?? clash.category}`); return false; }
      return true;
    });
    for (let i = 0; i < insert.length; i += 500) {
      await tx.insert(s.shifts).values(insert.slice(i, i + 500).map((r) => ({
        personnelId: r.personnelId, category: "WORK" as const, status: "PLANNED" as const, startAt: new Date(r.start), endAt: new Date(r.end),
        assetId: assetOf.get(r.tugName) ?? null, note: r.note, createdBy: role,
      })));
    }
    return { removed: removed.length, inserted: insert.length, skipped };
  });
  await recordAudit("rotation", fromStr, sim.system.peopleWithErrors || transition.length ? "APPLY_WITH_RISK" : "APPLY", { from: fromStr, weeks, ...result, skipped: result.skipped.length, transitionViolations: transition.length, health: sim.system.score, model }, role, risk || undefined);
  revalidatePath("/planlama"); revalidatePath("/planlama/rotasyon");
  return {
    ok: true,
    message: `${weeks} hafta takvime işlendi: ${result.inserted} vardiya oluşturuldu, ${result.removed} eski planlı rotasyon kaydı yenilendi${result.skipped.length ? `, ${result.skipped.length} vardiya mevcut kayıtla çakıştığı için atlandı` : ""}${transition.length ? ` · geçişte ${transition.length} kişide ihlal — risk kabulüyle kaydedildi` : ""}`,
    details: result.skipped.slice(0, 10), at: now(),
  };
}
