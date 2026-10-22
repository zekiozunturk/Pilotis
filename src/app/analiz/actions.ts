"use server";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { DEFAULT_ALERTS, type AlertCfg } from "@/lib/analytics/insights";
import type { AllocSettings } from "@/lib/analytics/model";
import { eq } from "drizzle-orm";

export type AState = { ok: boolean; message: string } | null;

export async function saveAlertCfg(_: AState, f: FormData): Promise<AState> {
  const role = await currentRole();
  if (!["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"].includes(role)) return { ok: false, message: `Uyarı eşiklerini yalnız yönetici değiştirebilir (${ROLE_LABELS[role]})` };
  const cfg = { ...DEFAULT_ALERTS } as AlertCfg;
  for (const k of Object.keys(DEFAULT_ALERTS) as (keyof AlertCfg)[]) {
    const v = Number(String(f.get(k) ?? "").replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return { ok: false, message: `Geçersiz değer: ${k}` };
    cfg[k] = v;
  }
  const reason = String(f.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, message: "Değişiklik gerekçesi zorunlu" };
  const [prev] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "analytics.alerts"));
  await db.insert(s.appSettings).values({ key: "analytics.alerts", value: cfg, updatedBy: role }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: cfg, updatedBy: role, updatedAt: new Date() } });
  await db.insert(s.auditLog).values({ entity: "setting", entityId: "analytics.alerts", action: "UPDATE", before: (prev?.value ?? DEFAULT_ALERTS) as object, after: cfg, actorId: role, reason });
  revalidatePath("/analiz", "layout");
  return { ok: true, message: "Uyarı eşikleri kaydedildi" };
}

export async function saveAllocation(_: AState, f: FormData): Promise<AState> {
  const role = await currentRole();
  if (!["SYSTEM_ADMIN", "BUSINESS_MANAGER"].includes(role)) return { ok: false, message: `Dağıtım yöntemini yalnız işletme yöneticisi onaylar (${ROLE_LABELS[role]})` };
  const method = f.get("method") === "WEIGHTS" ? "WEIGHTS" : "DURATION";
  const roleWeights: Record<string, number> = {};
  for (const r of ["KAPTAN", "BASCARKCI", "YAGCI", "PIMCI", "KILAVUZ"]) { const v = Number(String(f.get(`w_${r}`) ?? "1").replace(",", ".")); if (!(v > 0 && v <= 5)) return { ok: false, message: `Ağırlık 0–5 arasında olmalı (${r})` }; roleWeights[r] = v; }
  const note = String(f.get("note") ?? "").trim();
  if (note.length < 5) return { ok: false, message: "Gerekçe zorunlu" };
  const [prev] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, "analytics.allocation"));
  const version = ((prev?.value as AllocSettings | undefined)?.version ?? 1) + 1;
  const v: AllocSettings = { method, roleWeights, version, approvedBy: ROLE_LABELS[role], note };
  await db.insert(s.appSettings).values({ key: "analytics.allocation", value: v, updatedBy: role }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: v, updatedBy: role, updatedAt: new Date() } });
  await db.insert(s.auditLog).values({ entity: "setting", entityId: "analytics.allocation", action: "UPDATE", before: (prev?.value ?? null) as object, after: v, actorId: role, reason: note });
  revalidatePath("/analiz", "layout");
  return { ok: true, message: `Dağıtım yöntemi sürüm ${version} olarak kaydedildi` };
}
