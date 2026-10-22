"use server";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import type { Role } from "@/lib/workflow";
import { fetchTcmb, type FxPolicy } from "@/lib/fx";
import { recordAudit } from "@/lib/ops";

export type KState = { ok: boolean; message: string; at?: string } | null;
async function need(roles: Role[]) {
  const r = await currentRole();
  if (r !== "SYSTEM_ADMIN" && !roles.includes(r)) throw new Error(`Bu işlem için yetkiniz yok (${ROLE_LABELS[r]})`);
  return r;
}

export async function pullTcmb(_: KState, f: FormData): Promise<KState> {
  try {
    const role = await need(["ACCOUNTING", "TARIFF_OFFICER", "BUSINESS_MANAGER"]);
    const r = await fetchTcmb(String(f.get("date") || "") || undefined, role);
    await recordAudit("exchange_rates", r.bulletinDate, "TCMB_FETCH", r, role);
    revalidatePath("/kurlar");
    return { ok: true, message: r.saved ? `${r.bulletinDate} bülteni kaydedildi (${r.saved} kur)` : `${r.bulletinDate} bülteni zaten kayıtlı`, at: new Date().toISOString() };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function addManualRate(_: KState, f: FormData): Promise<KState> {
  try {
    const role = await need(["ACCOUNTING", "TARIFF_OFFICER"]);
    const g = (k: string) => String(f.get(k) ?? "").trim().replace(",", ".");
    const cur = g("currency"), date = g("bulletinDate"), no = g("bulletinNo"), buy = g("forexBuying"), sell = g("forexSelling");
    if (!["USD", "EUR"].includes(cur)) return { ok: false, message: "Döviz USD veya EUR olmalı" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Bülten tarihi gerekli" };
    if (!no) return { ok: false, message: "Kaynak (TCMB bülten no veya belge) zorunlu — kur kaynaksız girilemez" };
    if (![buy, sell].every((x) => /^\d+(\.\d+)?$/.test(x))) return { ok: false, message: "Alış ve satış kuru sayı olmalı (ör. 49.6015)" };
    if (Number(buy) > Number(sell)) return { ok: false, message: "Döviz alış kuru satıştan büyük olamaz — değerleri kontrol edin" };
    const res = await db.insert(s.exchangeRates).values({ currency: cur, bulletinDate: date, bulletinNo: no, forexBuying: buy, forexSelling: sell, source: "MANUAL", enteredBy: role }).onConflictDoNothing().returning();
    if (!res.length) return { ok: false, message: "Bu tarih için elle girilmiş kur zaten var (kayıtlar üzerine yazılmaz)" };
    await recordAudit("exchange_rates", res[0].id, "MANUAL_ENTRY", res[0], role);
    revalidatePath("/kurlar");
    return { ok: true, message: `${cur} ${date} kuru kaydedildi`, at: new Date().toISOString() };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function savePolicy(_: KState, f: FormData): Promise<KState> {
  try {
    const role = await need(["BUSINESS_MANAGER", "ACCOUNTING"]);
    const value: FxPolicy = { rateType: String(f.get("rateType")) === "FOREX_BUYING" ? "FOREX_BUYING" : "FOREX_SELLING", dateRule: (["COMPLETION_DAY_BULLETIN", "PREVIOUS_BULLETIN", "SAME_DAY_BULLETIN"].includes(String(f.get("dateRule"))) ? String(f.get("dateRule")) : "COMPLETION_DAY_BULLETIN") as FxPolicy["dateRule"], preferSource: "TCMB" };
    await db.insert(s.appSettings).values({ key: "fx.policy", value, updatedBy: role }).onConflictDoUpdate({ target: s.appSettings.key, set: { value, updatedBy: role, updatedAt: new Date() } });
    await recordAudit("app_settings", "fx.policy", "UPDATE", value, role, String(f.get("reason") || ""));
    revalidatePath("/", "layout");
    return { ok: true, message: "Kur ayarı güncellendi — sonraki hesaplarda geçerli; kayıtlı hesaplar değişmez", at: new Date().toISOString() };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
