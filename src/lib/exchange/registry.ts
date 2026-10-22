import "server-only";
/**
 * Excel veri alışverişi — kayıt türü tanımları.
 * Her tür: alanlar (tip/zorunluluk/izinli değerler), tekil anahtarlar (ada göre birleştirme YOK), yetkiler, mevcut kaydı bulma,
 * ekleme/güncelleme ve geri alma için anlık görüntü. Kesinleşmiş/onaylı kayıtlar genel aktarımla değiştirilemez.
 */
import { and, eq, inArray, ne, sql, desc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Role } from "@/lib/workflow";
import { imoValid, vknValid } from "./parse";
import { validatePriceList, type PriceItem } from "@/lib/pricing/pricelist";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type FType = "text" | "id" | "int" | "number" | "date" | "datetime" | "bool" | "enum" | "list";
export interface FieldDef { key: string; header: string; type: FType; required?: boolean; enum?: Record<string, string>; pad?: number; help?: string; aliases?: string[]; exportOnly?: boolean; currency?: string; check?: (v: unknown, row: Record<string, unknown>) => string | { warn: string } | null }
export interface Ctx { role: Role; batchId: string; target?: string | null }
export interface Found { id: string; current: Record<string, unknown>; protected?: string }
export interface EntityDef {
  key: string; label: string; description: string; group: string;
  fields: FieldDef[];
  keys: { field: string; label: string }[];
  mode: "upsert" | "insert";
  canExport: (r: Role) => boolean; canImport: (r: Role) => boolean; needsApproval: (r: Role) => boolean; approvers: Role[];
  target?: { label: string; options: () => Promise<{ v: string; l: string; editable: boolean }[]> };
  exportRows: (ctx: { role: Role; target?: string | null }) => Promise<Record<string, unknown>[]>;
  find: (tx: Tx, keyField: string, key: unknown, row: Record<string, unknown>, ctx: Ctx) => Promise<Found | null>;
  nameClash?: (tx: Tx, row: Record<string, unknown>) => Promise<string | null>;
  insert?: (tx: Tx, data: Record<string, unknown>, ctx: Ctx) => Promise<string>;
  update?: (tx: Tx, id: string, data: Record<string, unknown>, ctx: Ctx) => Promise<void>;
  snapshot: (tx: Tx, id: string, ctx: Ctx) => Promise<Record<string, unknown> | null>;
  remove?: (tx: Tx, id: string, ctx: Ctx) => Promise<string | null>; // null = silindi; metin = neden silinemedi
  restore?: (tx: Tx, id: string, data: Record<string, unknown>, ctx: Ctx) => Promise<void>;
  crossCheck?: (rows: { rowNo: number; data: Record<string, unknown> }[], ctx: Ctx, tx: Tx) => Promise<Map<number, { errors: string[]; warnings: string[] }>>;
  groupBy?: string; // aynı anahtara sahip satırlar tek kayıt (ör. fatura satırları)
}

const MGR: Role[] = ["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"];
const is = (...r: Role[]) => (x: Role) => r.includes(x);
const never = () => false;
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const num = (v: unknown) => (v == null || v === "" ? null : String(v));
const email = (v: unknown) => (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v)) ? "Geçersiz e-posta" : null);
const KIND = { "Şirket": "COMPANY", "Kişi": "PERSON", "Kurum": "AUTHORITY" };
const ASSET = { "Römorkör": "TUG", "Kılavuz botu": "PILOT_BOAT", "Palamar botu": "MOORING_BOAT", "Temizlik teknesi": "SURFACE_CLEANING_VESSEL", "Kara aracı": "LAND_VEHICLE", "Ekipman": "EQUIPMENT" };
const FAC = { "Tersane": "SHIPYARD", "Rıhtım": "QUAY", "Demir sahası": "ANCHORAGE", "Kılavuz istasyonu": "PILOT_STATION", "Kıyı emniyeti üssü": "COASTAL_SAFETY_BASE", "İşletme üssü": "OPERATOR_BASE", "Diğer": "OTHER" };
const ROLE = { "Römorkör kaptanı": "KAPTAN", "Başçarkçı": "BASCARKCI", "Yağcı": "YAGCI", "Pimci": "PIMCI", "Kılavuz kaptan": "KILAVUZ", "Kıyı operasyon": "KIYI_OPS" };
const PROFILE = { "Gemiadamı (STCW/MLC)": "STCW_MLC", "İş Kanunu": "IS_KANUNU" };
const SHIFT = { "Görev": "WORK", "Hazır bulunma": "STANDBY", "Eğitim": "TRAINING", "İzin": "LEAVE" };
const SK = { "Kılavuzluk": "PILOTAGE", "Römorkörcülük": "TOWAGE", "Palamar bağlama": "MOORING", "Palamar çözme": "UNMOORING", "Halat": "LINE_HANDLING", "Kiralama": "CHARTER", "Özel hizmet": "SPECIAL", "Emniyet römorkörü": "STANDBY_TUG" };
const COST = { "Personel": "PERSONNEL", "Fazla mesai": "OVERTIME", "Yakıt": "FUEL", "Alt yüklenici": "SUBCONTRACT", "Operasyona özel": "OP_SPECIFIC", "Bakım/onarım": "MAINTENANCE", "Genel gider": "OVERHEAD" };
const NATURE = { "Gerçekleşen": "ACTUAL", "Tahmini": "ESTIMATE", "Dağıtılmış": "ALLOCATED" };
const label = (m: Record<string, string>, code: unknown) => Object.entries(m).find(([, c]) => c === code)?.[0] ?? (code as string) ?? "";
const iso = (d: unknown) => (d instanceof Date ? d.getTime() : d);
const SYS_ID: FieldDef = { key: "_id", header: "Sistem kimliği", type: "id", help: "Dışa aktarılan dosyada gelir; güncellemede tekil anahtar olarak kullanılabilir. Yeni kayıtta boş bırakın." };

async function referenced(tx: Tx, checks: [string, string][], id: string): Promise<string | null> {
  for (const [table, col] of checks) { const r = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table} WHERE ${col} = '${id.replace(/'/g, "''")}'`)); if ((r.rows[0] as { n: number }).n > 0) return `başka kayıtlara bağlı (${table})`; }
  return null;
}

// ───────── 1. Cari ve şirketler ─────────
const parties: EntityDef = {
  key: "taraflar", label: "Cari ve şirketler", group: "Kayıtlar", description: "Firma, acente, tersane ve fatura muhatapları. Vergi no veya ETA kodu tekil anahtardır; aynı adlı kayıtlar ada bakılarak birleştirilmez.",
  fields: [SYS_ID,
    { key: "legalName", header: "Unvan", type: "text", required: true },
    { key: "shortName", header: "Kısa ad", type: "text" },
    { key: "kind", header: "Tür", type: "enum", enum: KIND },
    { key: "taxNumber", header: "Vergi no", type: "id", pad: 10, help: "10 hane, metin biçiminde (baştaki sıfırlar korunur)", check: (v, r) => (v && String(v).length === 11 && r.kind !== "PERSON" ? "11 haneli numara TC kimlik no olabilir — şirket kaydına yazılmaz" : v && !vknValid(String(v)) ? { warn: "Vergi no denetim hanesi tutmuyor — kontrol edin" } : null) },
    { key: "taxOffice", header: "Vergi dairesi", type: "text" },
    { key: "etaCode", header: "ETA cari kodu", type: "id" },
    { key: "address", header: "Adres", type: "text" }, { key: "city", header: "Şehir", type: "text" },
    { key: "country", header: "Ülke (ISO 2)", type: "text", check: (v) => (v && !/^[A-Z]{2}$/.test(String(v)) ? "Ülke iki harfli ISO kodu olmalı (TR, MT…)" : null) },
    { key: "phone", header: "Telefon", type: "id" }, { key: "email", header: "E-posta", type: "text", check: email }, { key: "website", header: "Web", type: "text" },
  ],
  keys: [{ field: "taxNumber", label: "Vergi no" }, { field: "etaCode", label: "ETA cari kodu" }, { field: "_id", label: "Sistem kimliği" }],
  mode: "upsert", canExport: is(...MGR, "ACCOUNTING", "AUDITOR", "PLANNER", "SHORE_OPS", "TARIFF_OFFICER"), canImport: is(...MGR, "ACCOUNTING"), needsApproval: never, approvers: ["BUSINESS_MANAGER"],
  exportRows: async () => (await db.select().from(s.parties).orderBy(s.parties.legalName)).map((p) => ({ _id: p.id, ...p, kind: label(KIND, p.kind) })),
  find: async (tx, k, v) => { if (v == null || v === "") return null; const col = k === "_id" ? s.parties.id : k === "etaCode" ? s.parties.etaCode : s.parties.taxNumber; const [r] = await tx.select().from(s.parties).where(eq(col, String(v))); return r ? { id: r.id, current: r as Record<string, unknown> } : null; },
  nameClash: async (tx, row) => { const [r] = await tx.select({ id: s.parties.id, t: s.parties.taxNumber }).from(s.parties).where(sql`lower(${s.parties.legalName}) = lower(${String(row.legalName ?? "")})`); return r ? `Aynı unvanlı kayıt mevcut (vergi no ${r.t ?? "—"}); ada bakılarak birleştirilmez — vergi no veya sistem kimliği verin` : null; },
  insert: async (tx, d) => (await tx.insert(s.parties).values({ kind: "COMPANY", ...(d as object), legalName: String(d.legalName) } as typeof s.parties.$inferInsert).returning({ id: s.parties.id }))[0].id,
  update: async (tx, id, d) => { await tx.update(s.parties).set({ ...(d as object), version: sql`${s.parties.version} + 1`, updatedAt: new Date() }).where(eq(s.parties.id, id)); },
  snapshot: async (tx, id) => { const [r] = await tx.select().from(s.parties).where(eq(s.parties.id, id)); return r ?? null; },
  remove: async (tx, id) => { const why = await referenced(tx, [["operations", "billing_party_id"], ["operations", "requester_party_id"], ["invoices", "party_id"], ["payments", "party_id"], ["port_calls", "agent_party_id"], ["party_roles", "party_id"]], id); if (why) return why; await tx.delete(s.parties).where(eq(s.parties.id, id)); return null; },
  restore: async (tx, id, d) => { await tx.update(s.parties).set(d as object).where(eq(s.parties.id, id)); },
};

// ───────── 2. Gemiler ─────────
const vessels: EntityDef = {
  key: "gemiler", label: "Gemi kayıtları", group: "Kayıtlar", description: "IMO numarası (denetim haneli) veya diğer resmî kimlik tekil anahtardır.",
  fields: [SYS_ID,
    { key: "name", header: "Gemi adı", type: "text", required: true },
    { key: "imo", header: "IMO", type: "id", pad: 7, check: (v) => (v && !imoValid(String(v)) ? "IMO numarası geçersiz (7 hane, denetim hanesi tutmuyor)" : null) },
    { key: "altOfficialId", header: "Diğer resmî kimlik", type: "id" },
    { key: "mmsi", header: "MMSI", type: "id", check: (v) => (v && !/^\d{9}$/.test(String(v)) ? "MMSI 9 hane olmalı" : null) },
    { key: "callSign", header: "Çağrı işareti", type: "id" },
    { key: "flag", header: "Bayrak (ISO 2)", type: "text", check: (v) => (v && !/^[A-Z]{2}$/.test(String(v)) ? "Bayrak iki harfli ISO kodu olmalı" : null) },
    { key: "vesselType", header: "Gemi tipi", type: "text" },
    { key: "gt", header: "GT", type: "number", check: (v) => (v != null && Number(v) <= 0 ? "GT pozitif olmalı" : null) },
    { key: "nt", header: "NT", type: "number" }, { key: "dwt", header: "DWT", type: "number" }, { key: "loa", header: "Boy (m)", type: "number" }, { key: "beam", header: "En (m)", type: "number" },
  ],
  keys: [{ field: "imo", label: "IMO" }, { field: "altOfficialId", label: "Diğer resmî kimlik" }, { field: "_id", label: "Sistem kimliği" }],
  mode: "upsert", canExport: is(...MGR, "ACCOUNTING", "AUDITOR", "PLANNER", "SHORE_OPS", "TARIFF_OFFICER", "PILOT"), canImport: is(...MGR, "SHORE_OPS"), needsApproval: is("SHORE_OPS"), approvers: ["OPERATIONS_MANAGER", "BUSINESS_MANAGER"],
  exportRows: async () => (await db.select().from(s.vessels).orderBy(s.vessels.name)).map((v) => ({ _id: v.id, ...v })),
  find: async (tx, k, v) => { if (v == null || v === "") return null; const col = k === "_id" ? s.vessels.id : k === "altOfficialId" ? s.vessels.altOfficialId : s.vessels.imo; const [r] = await tx.select().from(s.vessels).where(eq(col, String(v))); return r ? { id: r.id, current: r as Record<string, unknown> } : null; },
  nameClash: async (tx, row) => { const [r] = await tx.select({ imo: s.vessels.imo }).from(s.vessels).where(sql`lower(${s.vessels.name}) = lower(${String(row.name ?? "")})`); return r ? `Aynı adlı gemi mevcut (IMO ${r.imo ?? "—"}); gemi adı değişebildiği için ada göre birleştirilmez — IMO verin` : null; },
  insert: async (tx, d) => (await tx.insert(s.vessels).values({ ...(d as object), name: String(d.name), gt: num(d.gt), nt: num(d.nt), dwt: num(d.dwt), loa: num(d.loa), beam: num(d.beam) } as typeof s.vessels.$inferInsert).returning({ id: s.vessels.id }))[0].id,
  update: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; for (const k of ["gt", "nt", "dwt", "loa", "beam"]) if (k in x) x[k] = num(x[k]); await tx.update(s.vessels).set({ ...(x as object), updatedAt: new Date() }).where(eq(s.vessels.id, id)); },
  snapshot: async (tx, id) => { const [r] = await tx.select().from(s.vessels).where(eq(s.vessels.id, id)); return r ? { ...r, gt: r.gt == null ? null : Number(r.gt), nt: r.nt == null ? null : Number(r.nt), dwt: r.dwt == null ? null : Number(r.dwt), loa: r.loa == null ? null : Number(r.loa), beam: r.beam == null ? null : Number(r.beam) } : null; },
  remove: async (tx, id) => { const why = await referenced(tx, [["port_calls", "vessel_id"]], id); if (why) return why; await tx.delete(s.vessels).where(eq(s.vessels.id, id)); return null; },
  restore: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; for (const k of ["gt", "nt", "dwt", "loa", "beam"]) if (k in x) x[k] = num(x[k]); await tx.update(s.vessels).set(x as object).where(eq(s.vessels.id, id)); },
};

// ───────── 3. Personel (yetkili alanlar — hassas veri yok) ─────────
const personnel: EntityDef = {
  key: "personel", label: "Personel", group: "Kayıtlar", description: "Sicil no tekil anahtardır. Kimlik no, sağlık, adres gibi hassas alanlar bu aktarımla alınmaz ve verilmez.",
  fields: [SYS_ID,
    { key: "staffNo", header: "Sicil no", type: "id", required: true, pad: 6 },
    { key: "fullName", header: "Ad soyad", type: "text", required: true },
    { key: "title", header: "Unvan", type: "text", required: true },
    { key: "unit", header: "Birim", type: "text" },
    { key: "crewRole", header: "Görev", type: "enum", enum: ROLE },
    { key: "workProfile", header: "Çalışma profili", type: "enum", enum: PROFILE },
    { key: "rotationTeam", header: "Ekip", type: "text", check: (v) => (v && !/^R\d+-[A-Z]$/.test(String(v)) ? { warn: "Ekip kodu R1-A biçiminde değil — rotasyonla eşleşmeyebilir" } : null) },
    { key: "workPhone", header: "İş telefonu", type: "id" }, { key: "workEmail", header: "İş e-postası", type: "text", check: email },
    { key: "active", header: "Aktif", type: "bool" },
  ],
  keys: [{ field: "staffNo", label: "Sicil no" }, { field: "_id", label: "Sistem kimliği" }],
  mode: "upsert", canExport: is(...MGR, "PLANNER", "AUDITOR"), canImport: is(...MGR, "PLANNER"), needsApproval: is("PLANNER"), approvers: ["OPERATIONS_MANAGER", "BUSINESS_MANAGER"],
  exportRows: async () => (await db.select().from(s.personnel).orderBy(s.personnel.staffNo)).map((p) => ({ _id: p.id, staffNo: p.staffNo, fullName: p.fullName, title: p.title, unit: p.unit, crewRole: label(ROLE, p.crewRole), workProfile: label(PROFILE, p.workProfile), rotationTeam: p.rotationTeam, workPhone: p.workPhone, workEmail: p.workEmail, active: p.active })),
  find: async (tx, k, v) => { if (v == null || v === "") return null; const [r] = await tx.select().from(s.personnel).where(eq(k === "_id" ? s.personnel.id : s.personnel.staffNo, String(v))); return r ? { id: r.id, current: r as Record<string, unknown> } : null; },
  insert: async (tx, d) => (await tx.insert(s.personnel).values({ ...(d as object), fullName: String(d.fullName), title: String(d.title) } as typeof s.personnel.$inferInsert).returning({ id: s.personnel.id }))[0].id,
  update: async (tx, id, d) => { await tx.update(s.personnel).set({ ...(d as object), updatedAt: new Date() }).where(eq(s.personnel.id, id)); },
  snapshot: async (tx, id) => { const [r] = await tx.select().from(s.personnel).where(eq(s.personnel.id, id)); return r ?? null; },
  remove: async (tx, id) => { const why = await referenced(tx, [["shifts", "personnel_id"], ["participations", "personnel_id"], ["assignments", "personnel_id"], ["certificates", "personnel_id"]], id); if (why) return why; await tx.delete(s.personnel).where(eq(s.personnel.id, id)); return null; },
  restore: async (tx, id, d) => { await tx.update(s.personnel).set(d as object).where(eq(s.personnel.id, id)); },
};

// ───────── 4. Filo ve ekipman ─────────
const TECH = ["bollardPullT", "loa", "enginePowerKw", "buildYear", "imo", "mmsi"];
const fleet: EntityDef = {
  key: "filo", label: "Filo ve ekipman", group: "Kayıtlar", description: "Teknik kayıt aktarımı. Aktarılan teknik değerler doğrulama bekler: araç 'teknik dosya doğrulandı' durumuna aktarımla geçmez.",
  fields: [SYS_ID,
    { key: "code", header: "Kod", type: "id", help: "R1, R2…" }, { key: "name", header: "Araç adı", type: "text", required: true },
    { key: "type", header: "Araç sınıfı", type: "enum", enum: ASSET, required: true },
    { key: "imo", header: "IMO", type: "id", check: (v) => (v && !imoValid(String(v)) ? "IMO numarası geçersiz" : null) }, { key: "mmsi", header: "MMSI", type: "id" }, { key: "callSign", header: "Çağrı işareti", type: "id" },
    { key: "bollardPullT", header: "Çeki gücü (t)", type: "number", check: (v) => (v != null && (Number(v) <= 0 || Number(v) > 200) ? "Çeki gücü 0–200 t aralığında olmalı" : null) },
    { key: "loa", header: "Boy (m)", type: "number" }, { key: "enginePowerKw", header: "Makine gücü (kW)", type: "number" }, { key: "buildYear", header: "İnşa yılı", type: "int", check: (v) => (v != null && (Number(v) < 1950 || Number(v) > 2030) ? "İnşa yılı makul değil" : null) },
    { key: "available", header: "Kullanılabilir", type: "bool" }, { key: "restrictions", header: "Kısıtlar", type: "text" },
    { key: "specVerified", header: "Teknik dosya doğrulandı", type: "bool", exportOnly: true },
  ],
  keys: [{ field: "code", label: "Kod" }, { field: "imo", label: "IMO" }, { field: "_id", label: "Sistem kimliği" }],
  mode: "upsert", canExport: is(...MGR, "PLANNER", "AUDITOR", "SHORE_OPS", "TARIFF_OFFICER"), canImport: is(...MGR), needsApproval: never, approvers: ["OPERATIONS_MANAGER"],
  exportRows: async () => (await db.select().from(s.fleetAssets).orderBy(s.fleetAssets.code)).map((a) => ({ _id: a.id, ...a, type: label(ASSET, a.type), bollardPullT: a.bollardPullT == null ? null : Number(a.bollardPullT), loa: a.loa == null ? null : Number(a.loa), enginePowerKw: a.enginePowerKw == null ? null : Number(a.enginePowerKw) })),
  find: async (tx, k, v) => { if (v == null || v === "") return null; const col = k === "_id" ? s.fleetAssets.id : k === "imo" ? s.fleetAssets.imo : s.fleetAssets.code; const [r] = await tx.select().from(s.fleetAssets).where(eq(col, String(v))); return r ? { id: r.id, current: { ...r, bollardPullT: r.bollardPullT == null ? null : Number(r.bollardPullT), loa: r.loa == null ? null : Number(r.loa), enginePowerKw: r.enginePowerKw == null ? null : Number(r.enginePowerKw) } } : null; },
  nameClash: async (tx, row) => { const [r] = await tx.select({ c: s.fleetAssets.code }).from(s.fleetAssets).where(sql`lower(${s.fleetAssets.name}) = lower(${String(row.name ?? "")})`); return r ? `Aynı adlı araç mevcut (kod ${r.c ?? "—"}) — kod veya sistem kimliği verin` : null; },
  insert: async (tx, d) => (await tx.insert(s.fleetAssets).values({ ...(d as object), name: String(d.name), type: d.type as "TUG", bollardPullT: num(d.bollardPullT), loa: num(d.loa), enginePowerKw: num(d.enginePowerKw), specVerified: false } as typeof s.fleetAssets.$inferInsert).returning({ id: s.fleetAssets.id }))[0].id,
  update: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; for (const k of ["bollardPullT", "loa", "enginePowerKw"]) if (k in x) x[k] = num(x[k]); if (TECH.some((k) => k in d)) x.specVerified = false; await tx.update(s.fleetAssets).set({ ...(x as object), updatedAt: new Date() }).where(eq(s.fleetAssets.id, id)); },
  snapshot: async (tx, id) => { const [r] = await tx.select().from(s.fleetAssets).where(eq(s.fleetAssets.id, id)); return r ? { ...r, bollardPullT: r.bollardPullT == null ? null : Number(r.bollardPullT), loa: r.loa == null ? null : Number(r.loa), enginePowerKw: r.enginePowerKw == null ? null : Number(r.enginePowerKw) } : null; },
  remove: async (tx, id) => { const why = await referenced(tx, [["participations", "asset_id"], ["shifts", "asset_id"], ["assignments", "asset_id"], ["timeline_events", "asset_id"]], id); if (why) return why; await tx.delete(s.fleetAssets).where(eq(s.fleetAssets.id, id)); return null; },
  restore: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; for (const k of ["bollardPullT", "loa", "enginePowerKw"]) if (k in x) x[k] = num(x[k]); await tx.update(s.fleetAssets).set(x as object).where(eq(s.fleetAssets.id, id)); },
};

// ───────── 5. Tesisler ─────────
const facilities: EntityDef = {
  key: "tesisler", label: "Tesisler", group: "Kayıtlar", description: "Tersane, rıhtım ve demir sahaları. Koordinat değişikliği doğrulama durumunu 'doğrulanmadı'ya çeker.",
  fields: [SYS_ID, { key: "code", header: "Tesis kodu", type: "id" }, { key: "name", header: "Tesis adı", type: "text", required: true }, { key: "type", header: "Tesis tipi", type: "enum", enum: FAC, required: true },
    { key: "lat", header: "Enlem", type: "number", check: (v) => (v != null && (Number(v) < 39 || Number(v) > 42) ? { warn: "Enlem Marmara aralığı dışında" } : null) },
    { key: "lon", header: "Boylam", type: "number", check: (v) => (v != null && (Number(v) < 26 || Number(v) > 31) ? { warn: "Boylam Marmara aralığı dışında" } : null) },
    { key: "coordSource", header: "Koordinat kaynağı", type: "text" }],
  keys: [{ field: "code", label: "Tesis kodu" }, { field: "_id", label: "Sistem kimliği" }],
  mode: "upsert", canExport: is(...MGR, "PLANNER", "SHORE_OPS", "AUDITOR", "TARIFF_OFFICER"), canImport: is(...MGR), needsApproval: never, approvers: ["OPERATIONS_MANAGER"],
  exportRows: async () => (await db.select().from(s.facilities).orderBy(s.facilities.code)).map((f) => ({ _id: f.id, ...f, type: label(FAC, f.type), lat: f.lat == null ? null : Number(f.lat), lon: f.lon == null ? null : Number(f.lon) })),
  find: async (tx, k, v) => { if (v == null || v === "") return null; const [r] = await tx.select().from(s.facilities).where(eq(k === "_id" ? s.facilities.id : s.facilities.code, String(v))); return r ? { id: r.id, current: { ...r, lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon) } } : null; },
  nameClash: async (tx, row) => { const [r] = await tx.select({ c: s.facilities.code }).from(s.facilities).where(sql`lower(${s.facilities.name}) = lower(${String(row.name ?? "")})`); return r ? `Aynı adlı tesis mevcut (kod ${r.c ?? "—"}) — tesis kodu verin` : null; },
  insert: async (tx, d) => (await tx.insert(s.facilities).values({ ...(d as object), name: String(d.name), type: d.type as "SHIPYARD", lat: num(d.lat), lon: num(d.lon), verification: "UNVERIFIED" } as typeof s.facilities.$inferInsert).returning({ id: s.facilities.id }))[0].id,
  update: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; if ("lat" in x || "lon" in x) { x.verification = "UNVERIFIED"; x.lat = num(x.lat); x.lon = num(x.lon); } await tx.update(s.facilities).set({ ...(x as object), updatedAt: new Date() }).where(eq(s.facilities.id, id)); },
  snapshot: async (tx, id) => { const [r] = await tx.select().from(s.facilities).where(eq(s.facilities.id, id)); return r ? { ...r, lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon) } : null; },
  remove: async (tx, id) => { const why = await referenced(tx, [["operations", "to_facility_id"], ["operations", "from_facility_id"]], id); if (why) return why; await tx.delete(s.facilities).where(eq(s.facilities.id, id)); return null; },
  restore: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; if ("lat" in x) x.lat = num(x.lat); if ("lon" in x) x.lon = num(x.lon); await tx.update(s.facilities).set(x as object).where(eq(s.facilities.id, id)); },
};

// ───────── 6. Terminoloji ─────────
const LANGS = ["en", "de", "it", "nb", "ar"] as const;
type Tr = Record<string, { text: string; reviewed: boolean; reviewer?: string }>;
const terms: EntityDef = {
  key: "terminoloji", label: "Terminoloji", group: "Kataloglar", description: "Terim numarası kalıcıdır ve tekil anahtardır. Değişen çeviriler taslağa döner (insan onayı gerekir).",
  fields: [{ key: "number", header: "No", type: "int", required: true }, { key: "tr", header: "Türkçe terim", type: "text", required: true }, { key: "aliases", header: "Eş anlamlılar (; ile)", type: "list" },
    { key: "definition", header: "Tanım", type: "text", required: true, check: (v) => (v != null && String(v).length < 10 ? "Tanım en az 10 karakter" : null) }, { key: "source", header: "Kaynak", type: "text" }, { key: "confusedWith", header: "Karıştırılmamalı", type: "text" },
    ...LANGS.map((l) => ({ key: `t_${l}`, header: { en: "İngilizce", de: "Almanca", it: "İtalyanca", nb: "Norveççe", ar: "Arapça" }[l], type: "text" as FType }))],
  keys: [{ field: "number", label: "No" }],
  mode: "upsert", canExport: () => true, canImport: is(...MGR, "TARIFF_OFFICER"), needsApproval: never, approvers: ["TARIFF_OFFICER"],
  exportRows: async () => (await db.select().from(s.terms).orderBy(s.terms.number)).map((t) => ({ ...t, aliases: t.aliases, ...Object.fromEntries(LANGS.map((l) => [`t_${l}`, (t.translations as Tr)[l]?.text ?? ""])) })),
  find: async (tx, _k, v) => { const [r] = await tx.select().from(s.terms).where(eq(s.terms.number, Number(v))); return r ? { id: String(r.number), current: { ...r, ...Object.fromEntries(LANGS.map((l) => [`t_${l}`, (r.translations as Tr)[l]?.text ?? ""])) } } : null; },
  insert: async (tx, d) => { const tr = Object.fromEntries(LANGS.map((l) => [l, { text: String(d[`t_${l}`] ?? ""), reviewed: false }])); await tx.insert(s.terms).values({ number: Number(d.number), slug: `t-${d.number}-${String(d.tr).toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşıöç]+/g, "-").slice(0, 40)}`, tr: String(d.tr), aliases: (d.aliases as string[]) ?? [], definition: String(d.definition), source: (d.source as string) ?? null, confusedWith: (d.confusedWith as string) ?? null, translations: tr, status: "TASLAK" }); return String(d.number); },
  update: async (tx, id, d) => {
    const [cur] = await tx.select().from(s.terms).where(eq(s.terms.number, Number(id)));
    const tr = { ...(cur.translations as Tr) };
    for (const l of LANGS) if (`t_${l}` in d && String(d[`t_${l}`] ?? "") !== (tr[l]?.text ?? "")) tr[l] = { text: String(d[`t_${l}`] ?? ""), reviewed: false };
    const x = pick(d, ["tr", "aliases", "definition", "source", "confusedWith"]);
    await tx.update(s.terms).set({ ...(x as object), translations: tr, version: cur.version + 1, status: LANGS.every((l) => tr[l]?.reviewed) ? "ONAYLI" : LANGS.some((l) => tr[l]?.reviewed) ? "KISMEN_ONAYLI" : "TASLAK", updatedAt: new Date() }).where(eq(s.terms.number, Number(id)));
  },
  snapshot: async (tx, id) => { const [r] = await tx.select().from(s.terms).where(eq(s.terms.number, Number(id))); return r ? { ...r, ...Object.fromEntries(LANGS.map((l) => [`t_${l}`, (r.translations as Tr)[l]?.text ?? ""])) } : null; },
  remove: async (tx, id) => { await tx.delete(s.terms).where(eq(s.terms.number, Number(id))); return null; },
  restore: async (tx, id, d) => {
    const [cur] = await tx.select().from(s.terms).where(eq(s.terms.number, Number(id)));
    const tr = { ...(cur.translations as Tr) }; for (const l of LANGS) if (`t_${l}` in d) tr[l] = { text: String(d[`t_${l}`] ?? ""), reviewed: false };
    await tx.update(s.terms).set({ ...(pick(d, ["tr", "aliases", "definition", "source", "confusedWith"]) as object), translations: tr }).where(eq(s.terms.number, Number(id)));
  },
};

// ───────── 7. Fiyat listesi (taslak tarife sürümüne) ─────────
const EDITABLE = ["DRAFT", "SOURCE_FOUND"];
async function versionItems(tx: Tx, vid: string) { const [v] = await tx.select().from(s.tariffVersions).where(eq(s.tariffVersions.id, vid)); return v ? { v, items: ((v.definition as { items?: PriceItem[] }).items ?? []) as PriceItem[] } : null; }
async function writeItems(tx: Tx, vid: string, items: PriceItem[]) { const x = await versionItems(tx, vid); if (!x) throw new Error("Sürüm yok"); await tx.update(s.tariffVersions).set({ definition: { ...(x.v.definition as object), items }, rev: sql`${s.tariffVersions.rev} + 1` }).where(eq(s.tariffVersions.id, vid)); }
const priceList: EntityDef = {
  key: "fiyat-listesi", label: "Tarife fiyat listesi", group: "Tarife", description: "Yalnız taslak / kaynak bulundu statüsündeki sürüme aktarılır. Onaylı veya yürürlükteki sürüm aktarımla değişmez — yeni sürüm türetin. Formüller ve döngüler doğrulanır.",
  fields: [{ key: "code", header: "Kalem kodu", type: "id", required: true, check: (v) => (!/^\d{3}\.\d{3}$/.test(String(v ?? "")) ? "Kalem kodu 200.001 biçiminde olmalı" : null) },
    { key: "name", header: "Kalem adı", type: "text", required: true }, { key: "unit", header: "Birim", type: "text", required: true },
    { key: "currency", header: "Para birimi", type: "enum", enum: { "TL": "TRY", "TRY": "TRY", "USD": "USD" }, required: true },
    { key: "price", header: "Birim fiyat", type: "number" }, { key: "formula", header: "Formül", type: "text", help: "Örn. %30 * [200.001]; fiyat veya formülden biri" },
    { key: "serviceKind", header: "Hizmet", type: "enum", enum: SK }, { key: "note", header: "Not", type: "text" }],
  keys: [{ field: "code", label: "Kalem kodu" }],
  mode: "upsert", canExport: is(...MGR, "TARIFF_OFFICER", "ACCOUNTING", "AUDITOR"), canImport: is("SYSTEM_ADMIN", "BUSINESS_MANAGER", "TARIFF_OFFICER"), needsApproval: never, approvers: ["BUSINESS_MANAGER"],
  target: { label: "Hedef tarife sürümü", options: async () => (await db.select().from(s.tariffVersions).orderBy(desc(s.tariffVersions.validFrom))).map((v) => ({ v: v.id, l: `${v.label} · ${v.status}`, editable: EDITABLE.includes(v.status) })) },
  exportRows: async ({ target }) => { if (!target) return []; const [v] = await db.select().from(s.tariffVersions).where(eq(s.tariffVersions.id, target)); return (((v?.definition as { items?: PriceItem[] })?.items) ?? []).map((i) => ({ ...i, currency: i.currency === "TRY" ? "TL" : i.currency, serviceKind: label(SK, i.serviceKind), price: i.price == null ? null : Number(i.price) })); },
  find: async (tx, _k, v, _row, ctx) => {
    const x = await versionItems(tx, ctx.target ?? ""); if (!x) return { id: "", current: {}, protected: "Hedef sürüm bulunamadı" };
    const prot = EDITABLE.includes(x.v.status) ? undefined : `Sürüm ${x.v.status} — onaylı/yürürlükteki sürüm aktarımla değiştirilemez; yeni sürüm türetin`;
    const it = x.items.find((i) => i.code === String(v));
    if (!it) return prot ? { id: "", current: {}, protected: prot } : null;
    return { id: it.code, current: { ...it, price: it.price == null ? null : Number(it.price) }, protected: prot };
  },
  crossCheck: async (rows, ctx, tx) => {
    const out = new Map<number, { errors: string[]; warnings: string[] }>();
    const x = await versionItems(tx, ctx.target ?? ""); if (!x) return out;
    const items = new Map(x.items.map((i) => [i.code, { ...i }]));
    for (const r of rows) { const d = r.data; const prev = items.get(String(d.code)) ?? ({} as PriceItem); items.set(String(d.code), { ...prev, ...d, code: String(d.code), price: d.price == null ? (d.formula ? null : prev.price ?? null) : String(d.price), formula: d.formula == null ? (d.price != null ? null : prev.formula ?? null) : String(d.formula) } as PriceItem); }
    const issues = validatePriceList([...items.values()]);
    for (const iss of issues) { const r = rows.find((x) => String(x.data.code) === iss.code); if (r) { const e = out.get(r.rowNo) ?? { errors: [], warnings: [] }; e.errors.push(iss.message); out.set(r.rowNo, e); } }
    return out;
  },
  insert: async (tx, d, ctx) => { const x = (await versionItems(tx, ctx.target!))!; const it = { code: String(d.code), name: String(d.name), unit: String(d.unit), currency: d.currency as "TRY", price: d.price == null ? null : String(d.price), formula: (d.formula as string) ?? null, serviceKind: (d.serviceKind as string) ?? null, note: (d.note as string) ?? null }; await writeItems(tx, ctx.target!, [...x.items, it]); return it.code; },
  update: async (tx, id, d, ctx) => { const x = (await versionItems(tx, ctx.target!))!; await writeItems(tx, ctx.target!, x.items.map((i) => (i.code === id ? { ...i, ...d, price: "price" in d ? (d.price == null ? null : String(d.price)) : i.price, formula: "price" in d && d.price != null && !("formula" in d) ? null : ("formula" in d ? (d.formula as string) ?? null : i.formula) } : i))); },
  snapshot: async (tx, id, ctx) => { const x = await versionItems(tx, ctx.target ?? ""); const it = x?.items.find((i) => i.code === id); return it ? { ...it, price: it.price == null ? null : Number(it.price) } : null; },
  remove: async (tx, id, ctx) => { const x = await versionItems(tx, ctx.target ?? ""); if (!x) return "sürüm yok"; if (!EDITABLE.includes(x.v.status)) return `sürüm artık ${x.v.status}`; const deps = x.items.filter((i) => i.formula?.includes(`[${id}]`)); if (deps.length) return `başka kalemlerin formülünde kullanılıyor (${deps.map((d) => d.code).join(", ")})`; await writeItems(tx, ctx.target!, x.items.filter((i) => i.code !== id)); return null; },
  restore: async (tx, id, d, ctx) => { const x = (await versionItems(tx, ctx.target!))!; await writeItems(tx, ctx.target!, x.items.map((i) => (i.code === id ? { ...i, ...d, price: "price" in d ? (d.price == null ? null : String(d.price)) : i.price } : i))); },
};

// ───────── 8. Vardiya planı (taslak) ─────────
async function personByStaff(tx: Tx, no: string) { const [p] = await tx.select().from(s.personnel).where(eq(s.personnel.staffNo, no)); return p; }
async function assetByCode(tx: Tx, code: string) { const [a] = await tx.select().from(s.fleetAssets).where(eq(s.fleetAssets.code, code)); return a; }
const shifts: EntityDef = {
  key: "vardiyalar", label: "Vardiya ve görev planı", group: "Planlama", description: "Planlı (taslak) vardiya olarak eklenir. Çakışan kayıt hata, dinlenme kuralı uyarısı raporlanır; aynı kişi+başlangıç zaten varsa atlanır.",
  fields: [{ key: "staffNo", header: "Sicil no", type: "id", required: true, pad: 6 }, { key: "category", header: "Tür", type: "enum", enum: SHIFT, required: true },
    { key: "start", header: "Başlangıç", type: "datetime", required: true }, { key: "end", header: "Bitiş", type: "datetime", required: true, check: (v, r) => (v != null && r.start != null && Number(v) <= Number(r.start) ? "Bitiş başlangıçtan sonra olmalı" : null) },
    { key: "assetCode", header: "Römorkör/araç kodu", type: "id" }, { key: "note", header: "Not", type: "text" }],
  keys: [{ field: "staffNo+start", label: "Sicil no + başlangıç" }],
  mode: "insert", canExport: is(...MGR, "PLANNER", "AUDITOR", "SHORE_OPS"), canImport: is(...MGR, "PLANNER"), needsApproval: never, approvers: ["OPERATIONS_MANAGER"],
  exportRows: async () => (await db.select({ x: s.shifts, p: s.personnel, a: s.fleetAssets }).from(s.shifts).innerJoin(s.personnel, eq(s.personnel.id, s.shifts.personnelId)).leftJoin(s.fleetAssets, eq(s.fleetAssets.id, s.shifts.assetId)).where(and(ne(s.shifts.status, "CANCELLED"), sql`${s.shifts.startAt} >= now() - interval '14 days'`)).orderBy(s.shifts.startAt)).map(({ x, p, a }) => ({ _id: x.id, staffNo: p.staffNo, fullName: p.fullName, category: label(SHIFT, x.category), start: x.startAt.getTime(), end: x.endAt.getTime(), assetCode: a?.code ?? "", note: x.note, status: x.status })),
  find: async (tx, _k, _v, row) => {
    const p = await personByStaff(tx, String(row.staffNo ?? "")); if (!p) return { id: "", current: {}, protected: `Sicil no bulunamadı: ${row.staffNo}` };
    const [x] = await tx.select().from(s.shifts).where(and(eq(s.shifts.personnelId, p.id), eq(s.shifts.startAt, new Date(Number(row.start))), ne(s.shifts.status, "CANCELLED")));
    return x ? { id: x.id, current: { staffNo: row.staffNo, category: x.category, start: x.startAt.getTime(), end: x.endAt.getTime() }, protected: "Aynı kişi ve başlangıçla kayıt zaten var" } : null;
  },
  crossCheck: async (rows, _ctx, tx) => {
    const out = new Map<number, { errors: string[]; warnings: string[] }>();
    const add = (n: number, k: "errors" | "warnings", m: string) => { const e = out.get(n) ?? { errors: [], warnings: [] }; e[k].push(m); out.set(n, e); };
    for (const r of rows) {
      const p = await personByStaff(tx, String(r.data.staffNo ?? "")); if (!p) { add(r.rowNo, "errors", `Sicil no bulunamadı: ${r.data.staffNo}`); continue; }
      if (r.data.assetCode && !(await assetByCode(tx, String(r.data.assetCode)))) add(r.rowNo, "errors", `Araç kodu bulunamadı: ${r.data.assetCode}`);
      const a = new Date(Number(r.data.start)), b = new Date(Number(r.data.end));
      const clash = await tx.select({ id: s.shifts.id }).from(s.shifts).where(and(eq(s.shifts.personnelId, p.id), ne(s.shifts.status, "CANCELLED"), sql`${s.shifts.startAt} < ${b} AND ${s.shifts.endAt} > ${a}`, sql`${s.shifts.startAt} <> ${a}`));
      if (clash.length) add(r.rowNo, "errors", "Kişinin mevcut bir kaydıyla çakışıyor");
      for (const o of rows) if (o !== r && o.data.staffNo === r.data.staffNo && Number(o.data.start) < Number(r.data.end) && Number(o.data.end) > Number(r.data.start) && o.rowNo < r.rowNo) add(r.rowNo, "errors", `Dosyadaki satır ${o.rowNo} ile çakışıyor`);
      if ((Number(r.data.end) - Number(r.data.start)) / 3_600_000 > 14 && r.data.category === "WORK") add(r.rowNo, "warnings", "14 saatten uzun görev — dinlenme kuralını kontrol edin (planlama ekranı ihlalleri gösterir)");
    }
    return out;
  },
  insert: async (tx, d, ctx) => { const p = (await personByStaff(tx, String(d.staffNo)))!; const a = d.assetCode ? await assetByCode(tx, String(d.assetCode)) : null; const [r] = await tx.insert(s.shifts).values({ personnelId: p.id, category: d.category as "WORK", status: "PLANNED", startAt: new Date(Number(d.start)), endAt: new Date(Number(d.end)), assetId: a?.id ?? null, note: (d.note as string) ?? "Excel aktarımı", createdBy: ctx.role, origin: "IMPORT" }).returning({ id: s.shifts.id }); return r.id; },
  snapshot: async (tx, id) => { const [x] = await tx.select().from(s.shifts).where(eq(s.shifts.id, id)); return x ? { category: x.category, start: x.startAt.getTime(), end: x.endAt.getTime(), status: x.status, actual: x.actualStartAt?.getTime() ?? null } : null; },
  remove: async (tx, id) => { const [x] = await tx.select().from(s.shifts).where(eq(s.shifts.id, id)); if (!x) return "kayıt yok"; if (x.actualStartAt || x.status !== "PLANNED") return "gerçekleşen kaydı veya onayı var"; await tx.delete(s.shifts).where(eq(s.shifts.id, id)); return null; },
};

// ───────── 9. Çalışma saatleri (gerçekleşen — onay bekler) ─────────
const hours: EntityDef = {
  key: "calisma-saatleri", label: "Çalışma saatleri (gerçekleşen)", group: "Planlama", description: "Planlı vardiyaya gerçekleşen giriş/çıkış işler; kayıt ONAY BEKLER durumuna düşer. Onaylanmış kayıt aktarımla değiştirilemez (düzeltme talebi gerekir). Gerekçe zorunlu.",
  fields: [{ key: "staffNo", header: "Sicil no", type: "id", required: true, pad: 6 }, { key: "shiftStart", header: "Planlı vardiya başlangıcı", type: "datetime", required: true, help: "Hangi vardiyaya ait olduğunu belirler (±2 saat)" },
    { key: "actualStart", header: "Gerçekleşen başlangıç", type: "datetime", required: true }, { key: "actualEnd", header: "Gerçekleşen bitiş", type: "datetime", required: true, check: (v, r) => (v != null && r.actualStart != null && Number(v) <= Number(r.actualStart) ? "Bitiş başlangıçtan sonra olmalı" : null) },
    { key: "reason", header: "Kaynak / gerekçe", type: "text", required: true, help: "ör. Gemi jurnali, puantaj cihazı" }],
  keys: [{ field: "staffNo+shiftStart", label: "Sicil no + vardiya başlangıcı" }],
  mode: "upsert", canExport: is(...MGR, "PLANNER", "AUDITOR"), canImport: is(...MGR, "PLANNER", "SHORE_OPS"), needsApproval: never, approvers: ["OPERATIONS_MANAGER"],
  exportRows: async () => (await db.select({ x: s.shifts, p: s.personnel }).from(s.shifts).innerJoin(s.personnel, eq(s.personnel.id, s.shifts.personnelId)).where(and(eq(s.shifts.category, "WORK"), sql`${s.shifts.endAt} < now()`, sql`${s.shifts.startAt} >= now() - interval '14 days'`)).orderBy(s.shifts.startAt)).map(({ x, p }) => ({ _id: x.id, staffNo: p.staffNo, fullName: p.fullName, shiftStart: x.startAt.getTime(), actualStart: x.actualStartAt?.getTime() ?? null, actualEnd: x.actualEndAt?.getTime() ?? null, reason: x.correctionReason ?? x.actualSource ?? "", approved: x.approvedAt ? "Onaylı" : "Onay bekliyor" })),
  find: async (tx, _k, _v, row) => {
    const p = await personByStaff(tx, String(row.staffNo ?? "")); if (!p) return { id: "", current: {}, protected: `Sicil no bulunamadı: ${row.staffNo}` };
    const t = Number(row.shiftStart);
    const [x] = await tx.select().from(s.shifts).where(and(eq(s.shifts.personnelId, p.id), eq(s.shifts.category, "WORK"), ne(s.shifts.status, "CANCELLED"), sql`abs(extract(epoch from (${s.shifts.startAt} - ${new Date(t)}))) <= 7200`));
    if (!x) return { id: "", current: {}, protected: "Bu kişi için o saatte planlı görev vardiyası yok — önce plan aktarın" };
    return { id: x.id, current: { staffNo: row.staffNo, shiftStart: row.shiftStart, actualStart: x.actualStartAt?.getTime() ?? null, actualEnd: x.actualEndAt?.getTime() ?? null, reason: x.correctionReason }, protected: x.approvedAt ? "Onaylanmış kayıt aktarımla değiştirilemez — düzeltme ve yeniden onay süreci gerekir" : undefined };
  },
  update: async (tx, id, d) => { await tx.update(s.shifts).set({ actualStartAt: new Date(Number(d.actualStart)), actualEndAt: new Date(Number(d.actualEnd)), actualSource: "IMPORT", correctionReason: String(d.reason ?? "Excel aktarımı"), approvedAt: null, approvedById: null }).where(eq(s.shifts.id, id)); },
  snapshot: async (tx, id) => { const [x] = await tx.select().from(s.shifts).where(eq(s.shifts.id, id)); return x ? { actualStart: x.actualStartAt?.getTime() ?? null, actualEnd: x.actualEndAt?.getTime() ?? null, reason: x.correctionReason, approved: !!x.approvedAt } : null; },
  restore: async (tx, id, d) => { await tx.update(s.shifts).set({ ...("actualStart" in d ? { actualStartAt: d.actualStart == null ? null : new Date(Number(d.actualStart)) } : {}), ...("actualEnd" in d ? { actualEndAt: d.actualEnd == null ? null : new Date(Number(d.actualEnd)) } : {}), ...("reason" in d ? { correctionReason: (d.reason as string) ?? null } : {}) }).where(eq(s.shifts.id, id)); },
};

// ───────── 10. Faturalar (muhasebe aktarımı — mutabakat akışı) ─────────
async function partyByKey(tx: Tx, k: string) { const [p] = await tx.select().from(s.parties).where(sql`${s.parties.taxNumber} = ${k} OR ${s.parties.etaCode} = ${k}`); return p; }
const invoices: EntityDef = {
  key: "faturalar", label: "Faturalar (muhasebe)", group: "Muhasebe", description: "Her satır bir fatura kalemidir; aynı fatura numaralı satırlar tek faturada toplanır. Mevcut fatura değiştirilmez (iade/düzeltme faturasıyla düzeltilir). Faturalar TL kesilir.",
  fields: [{ key: "number", header: "Fatura no", type: "id", required: true }, { key: "kind", header: "Tür", type: "enum", enum: { "Fatura": "INVOICE", "İade": "CREDIT_NOTE" }, required: true },
    { key: "party", header: "Cari (vergi no / ETA kodu)", type: "id", required: true }, { key: "issueDate", header: "Fatura tarihi", type: "date", required: true },
    { key: "currency", header: "Para birimi", type: "enum", enum: { "TL": "TRY", "TRY": "TRY", "USD": "USD", "EUR": "EUR" } },
    { key: "opRef", header: "İş emri", type: "id", help: "OP-2026-000123" }, { key: "serviceKind", header: "Hizmet", type: "enum", enum: SK },
    { key: "description", header: "Açıklama", type: "text", required: true }, { key: "net", header: "Tutar (KDV hariç)", type: "number", required: true }, { key: "tax", header: "KDV", type: "number", required: true },
    { key: "corrects", header: "Düzelttiği fatura no", type: "id" }],
  keys: [{ field: "number", label: "Fatura no" }], groupBy: "number",
  mode: "insert", canExport: is(...MGR, "ACCOUNTING", "AUDITOR"), canImport: is("SYSTEM_ADMIN", "BUSINESS_MANAGER", "ACCOUNTING"), needsApproval: never, approvers: ["BUSINESS_MANAGER"],
  exportRows: async () => { const inv = await db.select().from(s.invoices).orderBy(s.invoices.issueDate); const lines = await db.select({ l: s.invoiceLines, ref: s.operations.ref }).from(s.invoiceLines).leftJoin(s.operations, eq(s.operations.id, s.invoiceLines.operationId)); const ps = new Map((await db.select().from(s.parties)).map((p) => [p.id, p])); const byId = new Map(inv.map((i) => [i.id, i])); return lines.filter((x) => byId.has(x.l.invoiceId)).map(({ l, ref }) => { const i = byId.get(l.invoiceId)!; return { number: i.number, kind: i.kind === "INVOICE" ? "Fatura" : "İade", party: ps.get(i.partyId)?.taxNumber ?? ps.get(i.partyId)?.etaCode ?? "", partyName: ps.get(i.partyId)?.legalName, issueDate: i.issueDate, currency: i.currency === "TRY" ? "TL" : i.currency, opRef: ref ?? "", serviceKind: label(SK, l.serviceKind), description: l.description, net: Number(l.netAmount), tax: Number(l.taxAmount), corrects: i.correctsInvoiceId ? byId.get(i.correctsInvoiceId)?.number : "" }; }); },
  find: async (tx, _k, v) => { const [i] = await tx.select().from(s.invoices).where(eq(s.invoices.number, String(v))); return i ? { id: i.id, current: { number: i.number }, protected: "Bu fatura numarası zaten kayıtlı — kesinleşmiş fatura aktarımla değiştirilemez" } : null; },
  crossCheck: async (rows, _ctx, tx) => {
    const out = new Map<number, { errors: string[]; warnings: string[] }>();
    const add = (n: number, k: "errors" | "warnings", m: string) => { const e = out.get(n) ?? { errors: [], warnings: [] }; e[k].push(m); out.set(n, e); };
    const groups = new Map<string, typeof rows>(); for (const r of rows) groups.set(String(r.data.number), [...(groups.get(String(r.data.number)) ?? []), r]);
    for (const [no, g] of groups) {
      for (const k of ["kind", "party", "issueDate", "currency", "corrects"]) { const vals = new Set(g.map((r) => String(r.data[k] ?? ""))); if (vals.size > 1) for (const r of g.slice(1)) add(r.rowNo, "errors", `Aynı fatura (${no}) satırlarında “${k}” farklı`); }
      const h = g[0].data;
      if (!(await partyByKey(tx, String(h.party)))) add(g[0].rowNo, "errors", `Cari bulunamadı: ${h.party} (önce cari aktarın)`);
      if (h.kind === "CREDIT_NOTE") { if (!h.corrects) add(g[0].rowNo, "errors", "İade faturası için düzelttiği fatura no zorunlu"); else if (!(await tx.select().from(s.invoices).where(eq(s.invoices.number, String(h.corrects)))).length && !groups.has(String(h.corrects))) add(g[0].rowNo, "errors", `Düzeltilen fatura bulunamadı: ${h.corrects}`); if (g.some((r) => Number(r.data.net) > 0)) add(g[0].rowNo, "warnings", "İade tutarları pozitif girilmiş — negatif olarak kaydedilecek"); }
      for (const r of g) { if (r.data.opRef && !(await tx.select({ id: s.operations.id }).from(s.operations).where(eq(s.operations.ref, String(r.data.opRef)))).length) add(r.rowNo, "errors", `İş emri bulunamadı: ${r.data.opRef}`); if (!r.data.opRef) add(r.rowNo, "warnings", "İş emrine bağlı değil — analizde operasyona/kişiye dağıtılmaz"); const t = Number(r.data.tax), n = Number(r.data.net); if (n && Math.abs(t / n - 0.2) > 0.005 && t !== 0) add(r.rowNo, "warnings", `KDV oranı %${((t / n) * 100).toFixed(1)} — hizmet bazlı KDV eşlemesi AK-12'de doğrulanacak`); }
      if (h.currency && h.currency !== "TRY") add(g[0].rowNo, "warnings", "Faturalar TL kesilir — döviz fatura kaydı kontrol edilmeli");
    }
    return out;
  },
  insert: async (tx, d, ctx) => {
    const g = (d.__group as Record<string, unknown>[]) ?? [d]; const h = g[0];
    const p = (await partyByKey(tx, String(h.party)))!;
    const sign = h.kind === "CREDIT_NOTE" ? -1 : 1, abs = (x: unknown) => sign * Math.abs(Number(x));
    const net = g.reduce((s2, r) => s2 + abs(r.net), 0), tax = g.reduce((s2, r) => s2 + abs(r.tax), 0);
    const corr = h.corrects ? (await tx.select().from(s.invoices).where(eq(s.invoices.number, String(h.corrects))))[0] : null;
    const [inv] = await tx.insert(s.invoices).values({ number: String(h.number), kind: String(h.kind), partyId: p.id, issueDate: new Date(Number(h.issueDate) + 3 * 3_600_000).toISOString().slice(0, 10), currency: String(h.currency ?? "TRY"), netAmount: net.toFixed(2), taxAmount: tax.toFixed(2), correctsInvoiceId: corr?.id ?? null, source: "ETA_IMPORT", importBatchId: ctx.batchId }).returning();
    for (const r of g) { const op = r.opRef ? (await tx.select({ id: s.operations.id }).from(s.operations).where(eq(s.operations.ref, String(r.opRef))))[0] : null; await tx.insert(s.invoiceLines).values({ invoiceId: inv.id, operationId: op?.id ?? null, serviceKind: (r.serviceKind as string) ?? null, description: String(r.description), netAmount: abs(r.net).toFixed(2), taxAmount: abs(r.tax).toFixed(2) }); }
    return inv.id;
  },
  snapshot: async (tx, id) => { const [i] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)); return i ? { number: i.number, net: Number(i.netAmount), status: i.status } : null; },
  remove: async (tx, id) => { const m = await tx.select().from(s.paymentMatches).where(eq(s.paymentMatches.invoiceId, id)); if (m.length) return "tahsilatla eşleşmiş"; const c = await tx.select().from(s.invoices).where(eq(s.invoices.correctsInvoiceId, id)); if (c.length) return "iade faturası bağlı"; await tx.delete(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, id)); await tx.delete(s.invoices).where(eq(s.invoices.id, id)); return null; },
};

// ───────── 11. Tahsilatlar ─────────
const payments: EntityDef = {
  key: "tahsilatlar", label: "Tahsilatlar (muhasebe)", group: "Muhasebe", description: "Cari + dekont/referans no tekildir. Fatura no verilirse eşleşme yapılır; eşleşmeyen tahsilat hiçbir işe veya kişiye yazılmaz.",
  fields: [{ key: "party", header: "Cari (vergi no / ETA kodu)", type: "id", required: true }, { key: "date", header: "Tahsilat tarihi", type: "date", required: true }, { key: "amount", header: "Tutar", type: "number", required: true, check: (v) => (v != null && Number(v) <= 0 ? "Tutar pozitif olmalı" : null) },
    { key: "currency", header: "Para birimi", type: "enum", enum: { "TL": "TRY", "TRY": "TRY", "USD": "USD", "EUR": "EUR" } }, { key: "reference", header: "Dekont / referans no", type: "id", required: true },
    { key: "invoice", header: "Eşleşen fatura no", type: "id" }, { key: "matched", header: "Eşleşen tutar", type: "number" }],
  keys: [{ field: "party+reference", label: "Cari + referans" }],
  mode: "insert", canExport: is(...MGR, "ACCOUNTING", "AUDITOR"), canImport: is("SYSTEM_ADMIN", "BUSINESS_MANAGER", "ACCOUNTING"), needsApproval: never, approvers: ["BUSINESS_MANAGER"],
  exportRows: async () => { const ps = new Map((await db.select().from(s.parties)).map((p) => [p.id, p])); const inv = new Map((await db.select().from(s.invoices)).map((i) => [i.id, i.number])); const m = await db.select().from(s.paymentMatches); return (await db.select().from(s.payments).orderBy(s.payments.receivedDate)).map((p) => { const mm = m.filter((x) => x.paymentId === p.id); return { party: ps.get(p.partyId)?.taxNumber ?? ps.get(p.partyId)?.etaCode ?? "", partyName: ps.get(p.partyId)?.legalName, date: p.receivedDate, amount: Number(p.amount), currency: p.currency === "TRY" ? "TL" : p.currency, reference: p.reference, invoice: mm.map((x) => inv.get(x.invoiceId)).join(", "), matched: mm.reduce((a, x) => a + Number(x.amount), 0) }; }); },
  find: async (tx, _k, _v, row) => { const p = await partyByKey(tx, String(row.party ?? "")); if (!p) return { id: "", current: {}, protected: `Cari bulunamadı: ${row.party}` }; const [x] = await tx.select().from(s.payments).where(and(eq(s.payments.partyId, p.id), eq(s.payments.reference, String(row.reference ?? "")))); return x ? { id: x.id, current: {}, protected: "Bu cari ve referansla tahsilat zaten kayıtlı" } : null; },
  crossCheck: async (rows, _ctx, tx) => {
    const out = new Map<number, { errors: string[]; warnings: string[] }>();
    const add = (n: number, k: "errors" | "warnings", m: string) => { const e = out.get(n) ?? { errors: [], warnings: [] }; e[k].push(m); out.set(n, e); };
    for (const r of rows) {
      if (!r.data.invoice) { add(r.rowNo, "warnings", "Faturayla eşleşmiyor — operasyona bağlanmaz (açık avans)"); continue; }
      const [i] = await tx.select().from(s.invoices).where(eq(s.invoices.number, String(r.data.invoice)));
      if (!i) { add(r.rowNo, "errors", `Fatura bulunamadı: ${r.data.invoice}`); continue; }
      const p = await partyByKey(tx, String(r.data.party)); if (p && i.partyId !== p.id) add(r.rowNo, "errors", "Fatura başka bir cariye ait");
      const paid = (await tx.select().from(s.paymentMatches).where(eq(s.paymentMatches.invoiceId, i.id))).reduce((a, m) => a + Number(m.amount), 0);
      const open = Number(i.netAmount) + Number(i.taxAmount) - paid, want = Number(r.data.matched ?? r.data.amount);
      if (want > open + 0.01) add(r.rowNo, "errors", `Eşleşen tutar açık bakiyeyi (${open.toFixed(2)}) aşıyor`);
      if (want > Number(r.data.amount) + 0.01) add(r.rowNo, "errors", "Eşleşen tutar tahsilattan büyük olamaz");
    }
    return out;
  },
  insert: async (tx, d, ctx) => {
    const p = (await partyByKey(tx, String(d.party)))!;
    const [x] = await tx.insert(s.payments).values({ partyId: p.id, receivedDate: new Date(Number(d.date) + 3 * 3_600_000).toISOString().slice(0, 10), currency: String(d.currency ?? "TRY"), amount: Number(d.amount).toFixed(2), reference: String(d.reference), source: "ETA_IMPORT", importBatchId: ctx.batchId }).returning();
    if (d.invoice) { const [i] = await tx.select().from(s.invoices).where(eq(s.invoices.number, String(d.invoice))); await tx.insert(s.paymentMatches).values({ paymentId: x.id, invoiceId: i.id, amount: Number(d.matched ?? d.amount).toFixed(2) }); }
    return x.id;
  },
  snapshot: async (tx, id) => { const [x] = await tx.select().from(s.payments).where(eq(s.payments.id, id)); return x ? { amount: Number(x.amount), reference: x.reference } : null; },
  remove: async (tx, id) => { await tx.delete(s.paymentMatches).where(eq(s.paymentMatches.paymentId, id)); await tx.delete(s.payments).where(eq(s.payments.id, id)); return null; },
};

// ───────── 12. Maliyetler ─────────
const costs: EntityDef = {
  key: "maliyetler", label: "Maliyet kayıtları", group: "Muhasebe", description: "Kaynak belge no tekildir (tekrar yüklemede mükerrer kayıt oluşmaz). Gerçekleşen / tahmini / dağıtılmış ayrı işaretlenir.",
  fields: [{ key: "sourceRef", header: "Kaynak belge no", type: "id", required: true }, { key: "day", header: "Tarih", type: "date", required: true }, { key: "category", header: "Kategori", type: "enum", enum: COST, required: true },
    { key: "nature", header: "Nitelik", type: "enum", enum: NATURE, required: true }, { key: "amount", header: "Tutar (TL)", type: "number", required: true, currency: "TRY" },
    { key: "assetCode", header: "Araç kodu", type: "id" }, { key: "opRef", header: "İş emri", type: "id" }, { key: "teamKey", header: "Ekip", type: "text" }, { key: "description", header: "Açıklama", type: "text", required: true }],
  keys: [{ field: "sourceRef", label: "Kaynak belge no" }],
  mode: "upsert", canExport: is("SYSTEM_ADMIN", "BUSINESS_MANAGER", "ACCOUNTING", "AUDITOR"), canImport: is("SYSTEM_ADMIN", "BUSINESS_MANAGER", "ACCOUNTING"), needsApproval: never, approvers: ["BUSINESS_MANAGER"],
  exportRows: async ({ role }) => { const as = new Map((await db.select().from(s.fleetAssets)).map((a) => [a.id, a.code])); const os = new Map((await db.select({ id: s.operations.id, ref: s.operations.ref }).from(s.operations)).map((o) => [o.id, o.ref])); return (await db.select().from(s.costEntries).orderBy(s.costEntries.day)).filter((c) => role === "BUSINESS_MANAGER" || role === "ACCOUNTING" || role === "SYSTEM_ADMIN" || c.category !== "PERSONNEL").map((c) => ({ sourceRef: c.sourceRef ?? c.id, day: c.day, category: label(COST, c.category), nature: label(NATURE, c.nature), amount: Number(c.amount), assetCode: as.get(c.assetId ?? "") ?? "", opRef: os.get(c.operationId ?? "") ?? "", teamKey: c.teamKey ?? "", description: c.description })); },
  find: async (tx, _k, v) => { const [c] = await tx.select().from(s.costEntries).where(eq(s.costEntries.sourceRef, String(v))); return c ? { id: c.id, current: { sourceRef: c.sourceRef, day: new Date(`${c.day}T00:00:00+03:00`).getTime(), category: c.category, nature: c.nature, amount: Number(c.amount), description: c.description, teamKey: c.teamKey } } : null; },
  crossCheck: async (rows, _ctx, tx) => { const out = new Map<number, { errors: string[]; warnings: string[] }>(); for (const r of rows) { const e = { errors: [] as string[], warnings: [] as string[] }; if (r.data.assetCode && !(await assetByCode(tx, String(r.data.assetCode)))) e.errors.push(`Araç kodu bulunamadı: ${r.data.assetCode}`); if (r.data.opRef && !(await tx.select({ id: s.operations.id }).from(s.operations).where(eq(s.operations.ref, String(r.data.opRef)))).length) e.errors.push(`İş emri bulunamadı: ${r.data.opRef}`); if (e.errors.length || e.warnings.length) out.set(r.rowNo, e); } return out; },
  insert: async (tx, d, ctx) => { const a = d.assetCode ? await assetByCode(tx, String(d.assetCode)) : null; const o = d.opRef ? (await tx.select({ id: s.operations.id }).from(s.operations).where(eq(s.operations.ref, String(d.opRef))))[0] : null; const [c] = await tx.insert(s.costEntries).values({ sourceRef: String(d.sourceRef), day: new Date(Number(d.day) + 3 * 3_600_000).toISOString().slice(0, 10), category: String(d.category), nature: String(d.nature), amount: Number(d.amount).toFixed(2), assetId: a?.id ?? null, operationId: o?.id ?? null, teamKey: (d.teamKey as string) ?? null, description: String(d.description), source: "IMPORT", importBatchId: ctx.batchId }).returning({ id: s.costEntries.id }); return c.id; },
  update: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; delete x.assetCode; delete x.opRef; if ("day" in x) x.day = new Date(Number(x.day) + 3 * 3_600_000).toISOString().slice(0, 10); if ("amount" in x) x.amount = Number(x.amount).toFixed(2); await tx.update(s.costEntries).set(x as object).where(eq(s.costEntries.id, id)); },
  snapshot: async (tx, id) => { const [c] = await tx.select().from(s.costEntries).where(eq(s.costEntries.id, id)); return c ? { sourceRef: c.sourceRef, day: new Date(`${c.day}T00:00:00+03:00`).getTime(), category: c.category, nature: c.nature, amount: Number(c.amount), description: c.description, teamKey: c.teamKey } : null; },
  remove: async (tx, id) => { await tx.delete(s.costEntries).where(eq(s.costEntries.id, id)); return null; },
  restore: async (tx, id, d) => { const x: Record<string, unknown> = { ...d }; if ("day" in x) x.day = new Date(Number(x.day) + 3 * 3_600_000).toISOString().slice(0, 10); if ("amount" in x) x.amount = Number(x.amount).toFixed(2); await tx.update(s.costEntries).set(x as object).where(eq(s.costEntries.id, id)); },
};

// ───────── Yalnız dışa aktarım: iş emirleri ─────────
const STATUS: Record<string, Record<string, string>> = { opStatus: { READY: "Sevke hazır", COMPLETED: "Tamamlandı", PARTIAL: "Kısmen", CANCELLED: "İptal", STARTED: "Başladı", TRANSIT: "İntikalde", ON_SITE: "Sahada", PAUSED: "Durakladı" }, accrualStatus: { AWAITING_CALC: "Hesap bekliyor", IN_REVIEW: "Kontrolde", APPROVED: "Onaylı", DISPUTED: "İtirazlı", CORRECTED: "Düzeltildi" }, accountingStatus: { AWAITING_EXPORT: "Faturalanmadı", EXPORTED: "Aktarıldı", REJECTED: "Reddedildi", INVOICED: "Faturalandı", RECONCILED: "Mutabık" } };
const operations: EntityDef = {
  key: "operasyonlar", label: "İş emirleri", group: "Operasyon", description: "İş listeleri ve durumları. Kesinleşmiş operasyon kayıtları genel aktarımla değiştirilemez; geçmiş veri aktarımı ayrı, kontrollü bir süreçtir.",
  fields: [{ key: "ref", header: "İş emri", type: "id" }, { key: "plannedStart", header: "Planlanan başlangıç", type: "datetime" }, { key: "type", header: "Tür", type: "text" }, { key: "vessel", header: "Gemi", type: "text" }, { key: "imo", header: "IMO", type: "id" }, { key: "gt", header: "GT", type: "number" },
    { key: "billing", header: "Fatura muhatabı", type: "text" }, { key: "priority", header: "Nitelik", type: "text" }, { key: "opStatus", header: "Operasyon durumu", type: "text" }, { key: "accrualStatus", header: "Tahakkuk", type: "text" }, { key: "accountingStatus", header: "Muhasebe", type: "text" }],
  keys: [], mode: "insert", canExport: is(...MGR, "PLANNER", "SHORE_OPS", "ACCOUNTING", "AUDITOR", "TARIFF_OFFICER"), canImport: never, needsApproval: never, approvers: [],
  exportRows: async () => (await db.select({ o: s.operations, v: s.vessels, t: s.operationTypes, p: s.parties }).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId)).innerJoin(s.operationTypes, eq(s.operationTypes.code, s.operations.typeCode)).leftJoin(s.parties, eq(s.parties.id, s.operations.billingPartyId)).orderBy(desc(s.operations.plannedStart))).map(({ o, v, t, p }) => ({ _id: o.id, ref: o.ref, plannedStart: o.plannedStart?.getTime() ?? null, type: t.nameTr, vessel: v.name, imo: v.imo, gt: v.gt == null ? null : Number(v.gt), billing: p?.legalName ?? "", priority: { NORMAL: "Normal", MANDATORY: "Zorunlu", EMERGENCY: "Acil" }[o.priority] ?? o.priority, opStatus: STATUS.opStatus[o.opStatus] ?? o.opStatus, accrualStatus: STATUS.accrualStatus[o.accrualStatus] ?? o.accrualStatus, accountingStatus: STATUS.accountingStatus[o.accountingStatus] ?? o.accountingStatus })),
  find: async () => null, snapshot: async () => null,
};

export const ENTITIES: EntityDef[] = [parties, vessels, personnel, fleet, facilities, terms, priceList, shifts, hours, invoices, payments, costs, operations];
export const entityByKey = (k: string) => ENTITIES.find((e) => e.key === k);
export { inArray };
