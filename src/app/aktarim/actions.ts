"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { entityByKey } from "@/lib/exchange/registry";
import { storeUpload, loadUpload, readSheets, guessHeaderRow, autoMap, buildPlan, runBatch, revertBatch, batchNo, type Options, type PlanRow } from "@/lib/exchange/engine";

const MAX_BYTES = 25 * 1024 * 1024;
export type UploadRes = { ok: false; message: string } | { ok: true; batchId: string; no: string; sheets: { name: string; preview: string[][]; rows: number }[]; header: number; mapping: Record<string, string>; duplicateOf: string | null; macroNote: boolean; sheet: string };
const cellStr = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 16).replace("T", " ") : String(v));

export async function uploadFile(fd: FormData): Promise<UploadRes> {
  const role = await currentRole();
  const ent = entityByKey(String(fd.get("entity") ?? ""));
  if (!ent) return { ok: false, message: "Kayıt türü seçin" };
  if (!ent.canImport(role)) return { ok: false, message: `${ent.label} için içe aktarım yetkiniz yok (${ROLE_LABELS[role]})` };
  const file = fd.get("file") as File | null;
  if (!file || !file.size) return { ok: false, message: "Dosya seçin" };
  if (file.size > MAX_BYTES) return { ok: false, message: "Dosya 25 MB'den büyük" };
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!["xlsx", "xlsm", "csv", "txt"].includes(ext)) return { ok: false, message: "Yalnız .xlsx, .xlsm (makrolar çalıştırılmaz) ve .csv" };
  const buf = Buffer.from(await file.arrayBuffer());
  let sheets;
  try { sheets = await readSheets(buf, file.name); } catch (e) { return { ok: false, message: `Dosya okunamadı: ${(e as Error).message}` }; }
  const { key, hash } = await storeUpload(buf, ext);
  const [dup] = await db.select().from(s.importBatches).where(and(eq(s.importBatches.entity, ent.key), eq(s.importBatches.fileHash, hash), eq(s.importBatches.status, "DONE"))).orderBy(desc(s.importBatches.createdAt));
  const target = String(fd.get("target") ?? "") || null;
  const [b] = await db.insert(s.importBatches).values({ no: batchNo(), entity: ent.key, fileName: file.name, fileHash: hash, storageKey: key, createdBy: role, options: { target } }).returning();
  // PILOTIS dışa aktarımında ilk sayfa "Bilgi"dir — en çok alanı eşleşen sayfa seçilir
  const scored = sheets.map((sh) => { const h = guessHeaderRow(sh, ent); return { sh, h, n: Object.keys(autoMap((sh.rows[h] ?? []).map((c) => cellStr(c.v)), ent)).length }; }).sort((a, b) => b.n - a.n);
  const first = scored[0].sh;
  const header = scored[0].h;
  return {
    ok: true, batchId: b.id, no: b.no, duplicateOf: dup?.no ?? null, macroNote: ext === "xlsm", sheet: first.name,
    sheets: sheets.map((x) => ({ name: x.name, rows: x.rows.length, preview: x.rows.slice(0, 12).map((r) => r.map((c) => cellStr(c.v))) })),
    header, mapping: autoMap((first.rows[header] ?? []).map((c) => cellStr(c.v)), ent),
  };
}

export async function remap(batchId: string, sheet: string, header: number) {
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  const ent = entityByKey(b.entity)!;
  const sheets = await readSheets(await loadUpload(b.storageKey), b.fileName);
  const sh = sheets.find((x) => x.name === sheet) ?? sheets[0];
  return autoMap((sh.rows[header] ?? []).map((c) => cellStr(c.v)), ent);
}

export type PreviewRes = { ok: false; message: string } | { ok: true; summary: { insert: number; update: number; skip: number; error: number; total: number; groups?: number }; rows: (Omit<PlanRow, "data"> & { data: Record<string, string> })[]; needsApproval: boolean; approvers: string[] };
export async function preview(input: { batchId: string; sheet: string; header: number; mapping: Record<string, string>; options: Options }): Promise<PreviewRes> {
  const role = await currentRole();
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, input.batchId));
  if (!b) return { ok: false, message: "Aktarım bulunamadı" };
  if (b.createdBy !== role && !["SYSTEM_ADMIN", "BUSINESS_MANAGER"].includes(role)) return { ok: false, message: "Bu aktarımı başlatan kullanıcı değilsiniz" };
  if (!["UPLOADED", "VALIDATED", "DRY_RUN", "FAILED"].includes(b.status)) return { ok: false, message: `Aktarım durumu ${b.status} — yeniden doğrulanamaz` };
  const ent = entityByKey(b.entity)!;
  if (ent.target && !input.options.target) return { ok: false, message: `${ent.target.label} seçin` };
  if (ent.target) { const opts = await ent.target.options(); if (!opts.find((o) => o.v === input.options.target)?.editable) return { ok: false, message: "Seçilen sürüm aktarıma açık değil (yalnız taslak / kaynak bulundu)" }; }
  try {
    const sheets = await readSheets(await loadUpload(b.storageKey), b.fileName);
    const sh = sheets.find((x) => x.name === input.sheet) ?? sheets[0];
    const plan = await buildPlan(ent, sh, input.header, input.mapping, input.options, { role, batchId: b.id, target: input.options.target ?? null });
    await db.update(s.importBatches).set({ sheet: sh.name, headerRow: input.header, mapping: input.mapping, options: input.options, status: "VALIDATED", summary: plan.summary, total: plan.rows.length }).where(eq(s.importBatches.id, b.id));
    const fmt = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "number" && v > 1e11 ? new Date(v).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : String(v));
    return { ok: true, summary: plan.summary, rows: plan.rows.slice(0, 500).map((r) => ({ ...r, data: Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, fmt(v)])), changes: r.changes.map((c) => ({ ...c, from: fmt(c.from), to: fmt(c.to) })) })), needsApproval: ent.needsApproval(role), approvers: ent.approvers.map((r) => ROLE_LABELS[r]) };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function start(batchId: string, dryRun: boolean): Promise<{ ok: boolean; message: string }> {
  const role = await currentRole();
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  if (!b || !["VALIDATED", "DRY_RUN"].includes(b.status)) return { ok: false, message: "Önce doğrulayıp önizleyin" };
  if (b.createdBy !== role) return { ok: false, message: "Aktarımı başlatan kullanıcı çalıştırabilir" };
  const ent = entityByKey(b.entity)!;
  if (!dryRun && ent.needsApproval(role)) {
    await db.update(s.importBatches).set({ status: "AWAITING_APPROVAL", message: `Onay bekliyor: ${ent.approvers.map((r) => ROLE_LABELS[r]).join(" / ")}` }).where(eq(s.importBatches.id, b.id));
    revalidatePath("/aktarim");
    return { ok: true, message: `Aktarım onaya gönderildi (${ent.approvers.map((r) => ROLE_LABELS[r]).join(" / ")}) — onaylanınca çalışır` };
  }
  await db.delete(s.importRows).where(eq(s.importRows.batchId, b.id));
  void runBatch(b.id, dryRun); // arka planda — arayüz ilerlemeyi sorgular
  return { ok: true, message: dryRun ? "Kuru çalıştırma başladı" : "Aktarım başladı" };
}

export async function approve(batchId: string): Promise<{ ok: boolean; message: string }> {
  const role = await currentRole();
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  if (!b || b.status !== "AWAITING_APPROVAL") return { ok: false, message: "Onay bekleyen aktarım değil" };
  const ent = entityByKey(b.entity)!;
  if (!ent.approvers.includes(role) && role !== "SYSTEM_ADMIN") return { ok: false, message: `Onay yetkisi: ${ent.approvers.map((r) => ROLE_LABELS[r]).join(" / ")}` };
  if (b.createdBy === role) return { ok: false, message: "Görevler ayrılığı: aktarımı hazırlayan onaylayamaz" };
  await db.update(s.importBatches).set({ approvedBy: ROLE_LABELS[role] }).where(eq(s.importBatches.id, b.id));
  await db.delete(s.importRows).where(eq(s.importRows.batchId, b.id));
  void runBatch(b.id, false);
  revalidatePath("/aktarim");
  return { ok: true, message: "Onaylandı — aktarım çalışıyor (veriler çalıştırma anında yeniden doğrulanır)" };
}

export async function revert(batchId: string): Promise<{ ok: boolean; message: string }> {
  const role = await currentRole();
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  if (!b) return { ok: false, message: "Aktarım bulunamadı" };
  if (b.createdBy !== role && !["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"].includes(role)) return { ok: false, message: "Geri alma yetkiniz yok" };
  try { const r = await revertBatch(batchId, role); revalidatePath("/aktarim"); return { ok: true, message: `${r.undone} kayıt geri alındı${r.kept ? `; ${r.kept} kayıt sonradan değiştiği veya başka kayıtlara bağlı olduğu için korundu` : ""}` }; }
  catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function saveMapping(input: { entity: string; name: string; profile: string; mapping: Record<string, string>; headers: string[] }): Promise<{ ok: boolean; message: string }> {
  const role = await currentRole();
  if (!input.name.trim()) return { ok: false, message: "Şablon adı zorunlu" };
  // kolon numarası yerine başlık adına göre sakla (farklı dosyalarda da çalışsın)
  const byHeader = Object.fromEntries(Object.entries(input.mapping).filter(([, v]) => v).map(([i, f]) => [input.headers[Number(i)] ?? i, f]));
  await db.insert(s.importMappings).values({ entity: input.entity, name: input.name, profile: input.profile || null, mapping: byHeader, createdBy: role }).onConflictDoUpdate({ target: [s.importMappings.entity, s.importMappings.name], set: { mapping: byHeader, profile: input.profile || null } });
  return { ok: true, message: `Eşleştirme şablonu “${input.name}” kaydedildi` };
}
export async function listMappings(entity: string) { return (await db.select().from(s.importMappings).where(eq(s.importMappings.entity, entity))).map((m) => ({ name: m.name, profile: m.profile, mapping: m.mapping as Record<string, string> })); }
