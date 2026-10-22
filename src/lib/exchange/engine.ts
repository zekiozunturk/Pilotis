import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { createId } from "@/lib/id";
import type { Role } from "@/lib/workflow";
import { parseCsv, fromExcel, parseNumber, parseDate, parseBool, asText, normHeader, type RawCell, type Sheet } from "./parse";
import { entityByKey, type EntityDef, type FieldDef, type Ctx } from "./registry";

export const MAX_ROWS = 20000;
export interface Options { key: string; emptyCell: "KEEP" | "CLEAR" | "ERROR"; mode: "ALL" | "SKIP_BAD"; formulas: "VALUE" | "ERROR"; target?: string | null; allowNameDuplicates?: boolean }
export interface PlanRow { rowNo: number; action: "INSERT" | "UPDATE" | "SKIP" | "ERROR"; data: Record<string, unknown>; keyValue: string | null; existingId: string | null; changes: { field: string; from: unknown; to: unknown }[]; errors: string[]; warnings: string[]; groupLead?: number; reason?: string; cells?: Record<string, string> }
export interface Plan { rows: PlanRow[]; summary: { insert: number; update: number; skip: number; error: number; total: number; groups?: number } }
const STORE = path.resolve(process.cwd(), "var/imports");

export async function storeUpload(buf: Buffer, ext: string) {
  await mkdir(STORE, { recursive: true });
  const key = `${createId()}.${ext}`;
  await writeFile(path.join(STORE, key), buf);
  return { key, hash: createHash("sha256").update(buf).digest("hex") };
}
export const loadUpload = (key: string) => readFile(path.join(STORE, path.basename(key)));

/** Dosyayı sayfalara çözer. Makro çalıştırılmaz (.xlsm içeriği yalnız değer olarak okunur). */
export async function readSheets(buf: Buffer, fileName: string): Promise<Sheet[]> {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return [{ name: "CSV", rows: parseCsv(buf.toString("utf8")) }];
  if (ext !== "xlsx" && ext !== "xlsm") throw new Error("Yalnız .xlsx, .xlsm (makrolar çalıştırılmaz) ve .csv desteklenir");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const rows: RawCell[][] = [];
    ws.eachRow({ includeEmpty: true }, (r, i) => { const vals: RawCell[] = []; for (let c = 1; c <= Math.max(ws.columnCount, r.cellCount); c++) vals.push(fromExcel(r.getCell(c).value)); rows[i - 1] = vals; });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    return { name: ws.name, rows };
  });
}

/** Başlık satırını tahmin et: tanımlı alan başlıklarıyla en çok eşleşen ilk 10 satırdan biri */
export function guessHeaderRow(sheet: Sheet, ent: EntityDef) {
  const names = new Set(ent.fields.flatMap((f) => [normHeader(f.header), normHeader(f.key), ...(f.aliases ?? []).map(normHeader)]));
  let best = 0, bestScore = -1;
  sheet.rows.slice(0, 10).forEach((r, i) => { const sc = r.filter((c) => names.has(normHeader(String(c.v ?? "")))).length; if (sc > bestScore) { bestScore = sc; best = i; } });
  return best;
}
export function autoMap(headers: string[], ent: EntityDef): Record<string, string> {
  const m: Record<string, string> = {};
  headers.forEach((h, i) => {
    const n = normHeader(h);
    const f = ent.fields.find((x) => !x.exportOnly && (normHeader(x.header) === n || normHeader(x.key) === n || (x.aliases ?? []).some((a) => normHeader(a) === n)));
    if (f && !Object.values(m).includes(f.key)) m[String(i)] = f.key;
  });
  return m;
}

function typed(f: FieldDef, cell: RawCell, opts: Options): { ok: true; v: unknown; warn?: string } | { ok: false; error: string } | { empty: true } {
  if (cell.ext) return { ok: false, error: "Dış bağlantılı formül takip edilmez — değeri yapıştırarak yeniden yükleyin" };
  if (cell.err) return { ok: false, error: `Hücre hatası ${cell.err}` };
  if (cell.f && opts.formulas === "ERROR") return { ok: false, error: "Formüllü hücre (seçeneğe göre kabul edilmiyor)" };
  const raw = cell.v;
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return { empty: true };
  const fw = cell.f ? "formülün kayıtlı sonucu kullanıldı" : undefined;
  const wrap = (r: { ok: boolean; value?: unknown; warn?: string; error?: string }) => (r.ok ? { ok: true as const, v: r.value, warn: [r.warn, fw].filter(Boolean).join("; ") || undefined } : { ok: false as const, error: r.error! });
  switch (f.type) {
    case "text": return { ok: true, v: String(raw instanceof Date ? raw.toISOString().slice(0, 10) : raw).trim(), warn: fw };
    case "id": return wrap(asText(raw, { pad: f.pad }));
    case "int": { const r = parseNumber(raw); if (!r.ok) return { ok: false, error: r.error }; if (!Number.isInteger(r.value.n)) return { ok: false, error: `Tam sayı bekleniyor: ${raw}` }; return { ok: true, v: r.value.n, warn: r.warn }; }
    case "number": { const r = parseNumber(raw, f.currency); if (!r.ok) return { ok: false, error: r.error }; return { ok: true, v: r.value.n, warn: [r.warn, fw].filter(Boolean).join("; ") || undefined }; }
    case "date": return wrap(parseDate(raw));
    case "datetime": return wrap(parseDate(raw, true));
    case "bool": return wrap(parseBool(raw));
    case "list": return { ok: true, v: String(raw).split(/[;\n]+/).map((x) => x.trim()).filter(Boolean) };
    case "enum": {
      const t = normHeader(String(raw));
      const hit = Object.entries(f.enum ?? {}).find(([l, c]) => normHeader(l) === t || normHeader(c) === t);
      return hit ? { ok: true, v: hit[1] } : { ok: false, error: `“${raw}” geçersiz; izinli: ${Object.keys(f.enum ?? {}).join(", ")}` };
    }
  }
}
/** zaman damgası ve sürüm sayacı gibi teknik alanlar "sonradan değişti" kararına katılmaz */
const META = ["createdAt", "updatedAt", "version", "rev"];
const same = (a: unknown, b: unknown) => {
  if (a == null && b == null) return true;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  if (a instanceof Date) a = a.getTime(); if (b instanceof Date) b = b.getTime();
  if (typeof a === "string" && iso.test(a) && typeof b === "number") a = Date.parse(a);
  if (typeof b === "string" && iso.test(b) && typeof a === "number") b = Date.parse(b);
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b) && a != null && b != null;
  return String(a ?? "") === String(b ?? "");
};

/** Satırları doğrular ve eylem planı çıkarır (veritabanına yazmaz) */
export async function buildPlan(ent: EntityDef, sheet: Sheet, headerRow: number, mapping: Record<string, string>, opts: Options, ctx: Ctx): Promise<Plan> {
  const fields = new Map(ent.fields.map((f) => [f.key, f]));
  const data = sheet.rows.slice(headerRow + 1).map((r, i) => ({ rowNo: headerRow + 2 + i, cells: r })).filter((x) => x.cells.some((c) => c.v != null && String(c.v).trim() !== ""));
  if (data.length > MAX_ROWS) throw new Error(`En fazla ${MAX_ROWS} satır aktarılabilir (dosyada ${data.length})`);
  const mapped = Object.entries(mapping).filter(([, f]) => f && fields.has(f));
  const missingReq = ent.fields.filter((f) => f.required && !f.exportOnly && !mapped.some(([, k]) => k === f.key));
  return db.transaction(async (tx) => {
    const rows: PlanRow[] = [];
    for (const { rowNo, cells } of data) {
      const row: PlanRow = { rowNo, action: "INSERT", data: {}, keyValue: null, existingId: null, changes: [], errors: [], warnings: [], cells: {} };
      const empties: string[] = [];
      for (const [col, key] of mapped) {
        const f = fields.get(key)!;
        const cell = cells[Number(col)] ?? { v: null };
        row.cells![key] = cell.v == null ? "" : String(cell.v instanceof Date ? cell.v.toISOString() : cell.v);
        const t = typed(f, cell, opts);
        if ("empty" in t) { empties.push(key); continue; }
        if (!t.ok) { row.errors.push(`${f.header}: ${t.error}`); continue; }
        row.data[key] = t.v; if (t.warn) row.warnings.push(`${f.header}: ${t.warn}`);
      }
      const checkErr = new Map<string, string>();
      for (const [k, v] of Object.entries(row.data)) { const c = fields.get(k)?.check?.(v, row.data); if (typeof c === "string") checkErr.set(k, c); else if (c) row.warnings.push(`${fields.get(k)!.header}: ${c.warn}`); }
      for (const f of missingReq) row.errors.push(`Zorunlu kolon eşleştirilmedi: ${f.header}`);
      // Anahtar
      const parts = opts.key.split("+");
      const kv = parts.map((p) => row.data[p]);
      row.keyValue = kv.every((v) => v != null && v !== "") ? kv.map((v) => String(v)).join(" | ") : null;
      let found = row.keyValue || ent.mode === "insert" ? await ent.find(tx, opts.key, parts.length > 1 ? kv : kv[0], row.data, ctx) : null;
      // Seçili anahtar boşsa ama dışa aktarımdan gelen sistem kimliği varsa ona göre eşleştir (isimle asla)
      if (!found && !row.keyValue && opts.key !== "_id" && row.data._id && ent.fields.some((f) => f.key === "_id")) {
        found = await ent.find(tx, "_id", row.data._id, row.data, ctx);
        if (found) { row.keyValue = `#${String(row.data._id).slice(0, 8)}`; row.warnings.push("Anahtar boş — sistem kimliğiyle eşleştirildi"); }
      }
      // Kural ihlali yalnız yeni/değişen değerde hata; kayıtta zaten öyle duran ve değiştirilmeyen değer uyarıdır
      for (const [k, msg] of checkErr) {
        const c = found && !found.protected ? found.current[k] : undefined;
        if (found && !found.protected && same(typeof c === "string" && (fields.get(k)?.type === "number" || fields.get(k)?.type === "int") ? Number(c) : c, row.data[k])) row.warnings.push(`${fields.get(k)!.header}: ${msg} (mevcut kayıttaki değer — aktarım değiştirmiyor)`);
        else row.errors.push(`${fields.get(k)!.header}: ${msg}`);
      }
      if (found?.protected) { row.action = ent.mode === "insert" && found.id ? "SKIP" : "ERROR"; row.reason = found.protected; if (row.action === "ERROR") row.errors.push(found.protected); }
      else if (found) {
        row.existingId = found.id; row.action = "UPDATE";
        if (!ent.update) { row.action = "SKIP"; row.reason = "Bu kayıt türü yalnız eklenebilir — mevcut kayıt"; }
        for (const k of empties) { const f = fields.get(k)!; if (opts.emptyCell === "ERROR") row.errors.push(`${f.header}: boş hücre (seçeneğe göre hata)`); else if (opts.emptyCell === "CLEAR") { if (f.required) row.errors.push(`${f.header}: zorunlu alan temizlenemez`); else row.data[k] = null; } }
        const curOf = (k: string) => { const c = found.current[k]; const t = fields.get(k)?.type; return (t === "number" || t === "int") && typeof c === "string" && c !== "" ? Number(c) : c; };
        for (const [k, v] of Object.entries(row.data)) if (k !== "_id" && !opts.key.split("+").includes(k) && !same(curOf(k), v)) row.changes.push({ field: k, from: curOf(k) ?? null, to: v });
        if (row.action === "UPDATE" && !row.changes.length) { row.action = "SKIP"; row.reason = "Değişiklik yok"; }
      } else {
        if (opts.key === "_id" && row.keyValue) row.errors.push("Sistem kimliği bulunamadı — yeni kayıt için boş bırakın");
        for (const f of ent.fields) if (f.required && !f.exportOnly && (row.data[f.key] == null || row.data[f.key] === "") && !row.errors.some((e) => e.startsWith(f.header))) row.errors.push(`${f.header}: zorunlu`);
        if (opts.emptyCell === "ERROR") for (const k of empties) row.errors.push(`${fields.get(k)!.header}: boş hücre (seçeneğe göre hata)`);
        if (!ent.insert) row.errors.push("Bu kayıt türüne aktarımla yeni kayıt eklenemez");
        if (ent.nameClash && !row.keyValue && !opts.allowNameDuplicates) { const c = await ent.nameClash(tx, row.data); if (c) row.errors.push(c); }
        if (ent.nameClash && row.keyValue && !opts.allowNameDuplicates) { const c = await ent.nameClash(tx, row.data); if (c) row.warnings.push(c.replace(/;.*$/, "") + " — farklı kimlikle yeni kayıt açılacak"); }
      }
      if (row.errors.length) row.action = "ERROR";
      rows.push(row);
    }
    // Dosya içi tekrar eden anahtar (gruplu türlerde grup = tek kayıt)
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (!r.keyValue) continue;
      const prev = seen.get(r.keyValue);
      if (prev == null) { seen.set(r.keyValue, r.rowNo); continue; }
      if (ent.groupBy) { r.groupLead = prev; continue; }
      r.errors.push(`Dosyada tekrar eden anahtar (${r.keyValue}) — satır ${prev} ile`); r.action = "ERROR";
    }
    // Türe özel çapraz kontroller (çakışma, formül döngüsü, referanslar…)
    if (ent.crossCheck) {
      const cc = await ent.crossCheck(rows.filter((r) => r.action !== "ERROR" && r.action !== "SKIP").map((r) => ({ rowNo: r.rowNo, data: r.data })), ctx, tx);
      for (const r of rows) { const x = cc.get(r.rowNo); if (!x) continue; r.errors.push(...x.errors); r.warnings.push(...x.warnings); if (x.errors.length) r.action = "ERROR"; }
    }
    if (ent.groupBy) { // grup: bir satır hatalıysa bütün fatura hatalı
      const bad = new Set(rows.filter((r) => r.action === "ERROR").map((r) => r.groupLead ?? r.rowNo));
      for (const r of rows) if (bad.has(r.groupLead ?? r.rowNo) && r.action !== "ERROR") { r.action = "ERROR"; r.errors.push("Aynı belgenin başka satırında hata var"); }
    }
    const summary = { insert: rows.filter((r) => r.action === "INSERT" && !r.groupLead).length, update: rows.filter((r) => r.action === "UPDATE").length, skip: rows.filter((r) => r.action === "SKIP").length, error: rows.filter((r) => r.action === "ERROR").length, total: rows.length, groups: ent.groupBy ? new Set(rows.map((r) => r.groupLead ?? r.rowNo)).size : undefined };
    return { rows, summary };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** Aktarımı çalıştırır (arka planda çağrılır). Kuru çalıştırmada yazmaz. */
export async function runBatch(batchId: string, dryRun: boolean) {
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  if (!b) return;
  const ent = entityByKey(b.entity)!;
  const opts = b.options as Options;
  const ctx: Ctx = { role: b.createdBy as Role, batchId: b.id, target: opts.target ?? null };
  try {
    await db.update(s.importBatches).set({ status: "RUNNING", progress: 0 }).where(eq(s.importBatches.id, b.id));
    const sheets = await readSheets(await loadUpload(b.storageKey), b.fileName);
    const sheet = sheets.find((x) => x.name === b.sheet) ?? sheets[0];
    const plan = await buildPlan(ent, sheet, b.headerRow ?? 0, b.mapping as Record<string, string>, opts, ctx);
    await db.update(s.importBatches).set({ total: plan.rows.length }).where(eq(s.importBatches.id, b.id));
    const rec = (r: PlanRow, extra: Partial<typeof s.importRows.$inferInsert> = {}) => ({ batchId: b.id, rowNo: r.rowNo, action: r.action, entityId: r.existingId, errors: r.errors.length ? r.errors : null, warnings: r.warnings.length ? r.warnings : null, after: r.reason ? { reason: r.reason } : null, ...extra });
    if (dryRun || (opts.mode === "ALL" && plan.summary.error > 0)) {
      for (let i = 0; i < plan.rows.length; i += 500) await db.insert(s.importRows).values(plan.rows.slice(i, i + 500).map((r) => rec(r)));
      await db.update(s.importBatches).set({ status: dryRun ? "DRY_RUN" : "FAILED", summary: plan.summary, progress: plan.rows.length, finishedAt: new Date(), message: dryRun ? "Kuru çalıştırma — veritabanına yazılmadı" : `${plan.summary.error} hatalı satır var; “tamamı başarılıysa kaydet” seçildiği için hiçbir kayıt yazılmadı` }).where(eq(s.importBatches.id, b.id));
      return;
    }
    const write = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], r: PlanRow) => {
      if (r.action === "INSERT" && !r.groupLead) {
        const group = ent.groupBy ? plan.rows.filter((x) => x.rowNo === r.rowNo || x.groupLead === r.rowNo).map((x) => x.data) : undefined;
        const id = await ent.insert!(tx, group ? { ...r.data, __group: group } : r.data, ctx);
        const after = await ent.snapshot(tx, id, ctx);
        return { entityId: id, after, before: null };
      }
      if (r.action === "UPDATE") {
        const before = await ent.snapshot(tx, r.existingId!, ctx);
        const patch = Object.fromEntries(r.changes.map((c) => [c.field, c.to]));
        await ent.update!(tx, r.existingId!, patch, ctx);
        const after = await ent.snapshot(tx, r.existingId!, ctx);
        return { entityId: r.existingId, before: Object.fromEntries(r.changes.map((c) => [c.field, before?.[c.field] ?? null])), after: Object.fromEntries(r.changes.map((c) => [c.field, after?.[c.field] ?? null])) };
      }
      return null;
    };
    let done = 0;
    const counts = { insert: 0, update: 0, skip: 0, error: 0 };
    if (opts.mode === "ALL") {
      // Tamamı başarılıysa kaydet: tek işlem
      await db.transaction(async (tx) => {
        for (const r of plan.rows) { const w = await write(tx, r); await tx.insert(s.importRows).values(rec(r, w ? { entityId: w.entityId, before: w.before as object, after: w.after as object, appliedAt: new Date() } : {})); if (w) counts[r.action === "INSERT" ? "insert" : "update"]++; else counts[r.action === "ERROR" ? "error" : "skip"]++; if (++done % 50 === 0) await db.update(s.importBatches).set({ progress: done }).where(eq(s.importBatches.id, b.id)); }
      });
    } else {
      // Hatalı satırları ayır: her kayıt (grup) kendi işleminde — yarım kayıt oluşmaz
      for (const r of plan.rows) {
        try {
          await db.transaction(async (tx) => { const w = await write(tx, r); await tx.insert(s.importRows).values(rec(r, w ? { entityId: w.entityId, before: w.before as object, after: w.after as object, appliedAt: new Date() } : {})); if (w) counts[r.action === "INSERT" ? "insert" : "update"]++; else counts[r.action === "ERROR" ? "error" : "skip"]++; });
        } catch (e) { counts.error++; await db.insert(s.importRows).values(rec({ ...r, action: "ERROR", errors: [...r.errors, `Yazma hatası: ${(e as Error).message}`] })); }
        if (++done % 25 === 0) await db.update(s.importBatches).set({ progress: done }).where(eq(s.importBatches.id, b.id));
      }
    }
    const summary = { ...plan.summary, applied: counts };
    await db.update(s.importBatches).set({ status: "DONE", summary, progress: plan.rows.length, finishedAt: new Date(), message: `${counts.insert} kayıt eklendi, ${counts.update} güncellendi, ${counts.skip} atlandı, ${counts.error} hatalı satır işlenmedi` }).where(eq(s.importBatches.id, b.id));
    await db.insert(s.auditLog).values({ entity: "import", entityId: b.no, action: "IMPORT", after: { entity: b.entity, file: b.fileName, summary } as object, actorId: b.createdBy, reason: b.approvedBy ? `Onaylayan: ${b.approvedBy}` : null });
  } catch (e) {
    await db.update(s.importBatches).set({ status: "FAILED", finishedAt: new Date(), message: `İşlem durdu, değişiklik geri alındı: ${(e as Error).message}` }).where(eq(s.importBatches.id, b.id));
  }
}

/** Geri alma — sonradan yapılmış bağımsız değişiklikler silinmez; bağlı kayıtlar silinmez, raporlanır */
export async function revertBatch(batchId: string, actor: string) {
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  if (!b || b.status !== "DONE") throw new Error("Yalnız tamamlanmış aktarım geri alınabilir");
  const ent = entityByKey(b.entity)!;
  const ctx: Ctx = { role: actor as Role, batchId: b.id, target: (b.options as Options).target ?? null };
  const rows = (await db.select().from(s.importRows).where(eq(s.importRows.batchId, b.id)).orderBy(asc(s.importRows.rowNo))).filter((r) => r.appliedAt).reverse();
  let undone = 0, kept = 0;
  for (const r of rows) {
    const note = await db.transaction(async (tx) => {
      const cur = await ent.snapshot(tx, r.entityId!, ctx);
      const after = (r.after ?? {}) as Record<string, unknown>;
      if (r.action === "INSERT") {
        if (!cur) return "kayıt zaten yok";
        const changed = Object.keys(after).filter((k) => !META.includes(k) && !same(cur[k], after[k]));
        if (changed.length) return `aktarımdan sonra değiştirilmiş (${changed.join(", ")}) — silinmedi`;
        if (!ent.remove) return "bu tür silinemez";
        return (await ent.remove(tx, r.entityId!, ctx)) ?? "OK";
      }
      if (r.action === "UPDATE") {
        if (!cur) return "kayıt silinmiş";
        const before = (r.before ?? {}) as Record<string, unknown>;
        const restorable = Object.keys(after).filter((k) => same(cur[k], after[k]));
        const skipped = Object.keys(after).filter((k) => !same(cur[k], after[k]));
        if (restorable.length && ent.restore) await ent.restore(tx, r.entityId!, Object.fromEntries(restorable.map((k) => [k, before[k]])), ctx);
        return skipped.length ? `${restorable.length} alan geri alındı; sonradan değişen alanlar korunuyor: ${skipped.join(", ")}` : "OK";
      }
      return null;
    });
    if (note == null) continue;
    if (note === "OK" || note.endsWith("geri alındı")) undone++; else kept++;
    await db.update(s.importRows).set({ revertNote: note === "OK" ? "Geri alındı" : note }).where(eq(s.importRows.id, r.id));
  }
  const status = kept ? "PARTIALLY_REVERTED" : "REVERTED";
  await db.update(s.importBatches).set({ status, message: `Geri alma: ${undone} kayıt geri alındı, ${kept} kayıt korundu (sonradan değişmiş/bağlı)` }).where(eq(s.importBatches.id, b.id));
  await db.insert(s.auditLog).values({ entity: "import", entityId: b.no, action: "REVERT", after: { undone, kept } as object, actorId: actor });
  return { undone, kept, status };
}

/** Hatalı satırları işaretlenmiş indirilebilir dosya */
export async function errorWorkbook(batchId: string) {
  const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  const ent = entityByKey(b.entity)!;
  const sheets = await readSheets(await loadUpload(b.storageKey), b.fileName);
  const sheet = sheets.find((x) => x.name === b.sheet) ?? sheets[0];
  const rows = await db.select().from(s.importRows).where(eq(s.importRows.batchId, b.id));
  const byRow = new Map(rows.map((r) => [r.rowNo, r]));
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Hata raporu", { views: [{ state: "frozen", ySplit: (b.headerRow ?? 0) + 1 }] });
  const mapping = b.mapping as Record<string, string>;
  const fieldHeader = new Map(ent.fields.map((f) => [f.key, f.header]));
  sheet.rows.forEach((r, i) => {
    const out = ws.addRow([...r.map((c) => (c.v instanceof Date ? c.v : c.v == null ? null : typeof c.v === "string" && /^[=+\-@]/.test(c.v) ? `'${c.v}` : c.v)), i === (b.headerRow ?? 0) ? "Sonuç" : null, i === (b.headerRow ?? 0) ? "Hatalar / uyarılar" : null]);
    const rec = byRow.get(i + 1);
    if (!rec) return;
    const errs = (rec.errors as string[] | null) ?? [], warns = (rec.warnings as string[] | null) ?? [];
    out.getCell(r.length + 1).value = { INSERT: "Eklendi/eklenecek", UPDATE: "Güncellendi/güncellenecek", SKIP: "Atlandı", ERROR: "HATALI — işlenmedi" }[rec.action] ?? rec.action;
    out.getCell(r.length + 2).value = [...errs, ...warns.map((w) => `Uyarı: ${w}`)].join(" · ");
    if (rec.action === "ERROR") {
      for (const [col, key] of Object.entries(mapping)) if (errs.some((e) => e.startsWith(fieldHeader.get(key) ?? "§"))) out.getCell(Number(col) + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE8E6" } };
      out.getCell(r.length + 1).font = { bold: true, color: { argb: "FFB42318" } };
    }
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** İçe aktarım şablonu: Veri sayfası (başlıklar, açılır listeler, örnek satır) + Açıklama sayfası */
export async function templateWorkbook(ent: EntityDef) {
  const wb = new ExcelJS.Workbook(); wb.creator = "PILOTIS";
  const ws = wb.addWorksheet("Veri", { views: [{ state: "frozen", ySplit: 1 }] });
  const fs = ent.fields.filter((f) => !f.exportOnly);
  const head = ws.addRow(fs.map((f) => `${f.header}${f.required ? " *" : ""}`));
  head.font = { bold: true, color: { argb: "FFFFFFFF" } }; head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2D6B" } }; });
  fs.forEach((f, i) => {
    const col = ws.getColumn(i + 1); col.width = Math.max(14, f.header.length + 4);
    if (f.type === "id" || f.type === "text" || f.type === "list") col.numFmt = "@";
    if (f.type === "date") col.numFmt = "dd.mm.yyyy"; if (f.type === "datetime") col.numFmt = "dd.mm.yyyy hh:mm";
    if (f.enum) for (let r = 2; r <= 1000; r++) ws.getCell(r, i + 1).dataValidation = { type: "list", allowBlank: !f.required, formulae: [`"${[...new Set(Object.keys(f.enum))].join(",")}"`], showErrorMessage: true, errorTitle: "Geçersiz değer", error: `İzinli: ${Object.keys(f.enum).join(", ")}` };
    if (f.help) head.getCell(i + 1).note = f.help;
  });
  const info = wb.addWorksheet("Açıklama");
  info.columns = [{ width: 28 }, { width: 14 }, { width: 10 }, { width: 70 }];
  info.addRow([`${ent.label} — içe aktarım şablonu`]).font = { bold: true, size: 13 };
  info.addRow([ent.description]);
  info.addRow([`Tekil anahtarlar: ${ent.keys.map((k) => k.label).join(", ") || "—"} · Aynı adlı kayıtlar yalnız ada bakılarak birleştirilmez.`]);
  info.addRow(["Kimlik kolonları (vergi no, sicil no, IMO…) metin biçimindedir; baştaki sıfırları korumak için sayıya çevirmeyin. Makrolar çalıştırılmaz, dış bağlantılar takip edilmez."]);
  info.addRow([]);
  const h = info.addRow(["Kolon", "Tip", "Zorunlu", "Kurallar / izinli değerler"]); h.font = { bold: true };
  const TL: Record<string, string> = { text: "Metin", id: "Kimlik (metin)", int: "Tam sayı", number: "Sayı", date: "Tarih (gg.aa.yyyy)", datetime: "Tarih saat (gg.aa.yyyy ss:dd)", bool: "Evet/Hayır", enum: "Liste", list: "Liste (; ile)" };
  for (const f of fs) info.addRow([f.header, TL[f.type], f.required ? "Evet" : "", [f.enum ? Object.keys(f.enum).join(", ") : "", f.help ?? "", f.pad ? `${f.pad} hane` : "", f.currency ? `Para birimi ${f.currency}` : ""].filter(Boolean).join(" · ")]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export const batchNo = () => `AKT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
