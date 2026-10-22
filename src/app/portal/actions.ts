"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope } from "@/lib/session";
import { calculate, selectTariffVersion } from "@/lib/tariff/engine";
import { loadTariffs, ruleStatusMap } from "@/lib/ops";
import { getFxTable } from "@/lib/fx";
import { categorize, isContainerOrRoro } from "@/lib/tariff/category";
import { holidayAt } from "@/data/holidays";
import { createOperationRecord, istanbulDate } from "@/lib/create-op";
import { missingInfo, type Declaration } from "@/lib/declaration";
import { PACKAGES, OPERATION_TYPES } from "@/data/catalog";
import type { CalcInput, ServiceKind } from "@/lib/tariff/types";

export interface PackageCard {
  code: string; title: string; scope: string; outOfScope: string; docs: string[]; review: boolean;
  lines: { kind: string; amount: string | null; missing: string[] }[];
  total: string | null; currency: string; totalTRY: string | null; fxNote: string | null; categoryReason: string | null;
  tariffLabel: string | null; isDemoTariff: boolean; eligible: boolean;
  missingInfo: string[]; notes: string[];
}
export type PortalState = { ok: boolean; message?: string; cards?: PackageCard[]; input?: Record<string, string> } | null;

/** Dış kullanıcı kendi firması; iç kullanıcı "adına" seçtiği firma için çalışır. */
async function actingParty(f?: FormData): Promise<string> {
  const scope = await currentScope();
  if (scope.external) { if (!scope.partyId) throw new Error("Firma seçili değil"); return scope.partyId; }
  const p = String(f?.get("onBehalfPartyId") || "");
  if (!p) throw new Error("Hangi firma adına talep oluşturulduğunu seçin");
  return p;
}

function readDecl(f: FormData): Declaration {
  const str = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
  const gt = str("gt");
  return { gt: gt ? Number(gt.replace(",", ".")) : null, engine: str("engine"), cargoCondition: str("cargoCondition"), dgClass: str("dgClass"), unNumber: str("unNumber"), gasFreeCert: f.get("gasFreeCert") === "on" ? true : null };
}

export async function estimatePackages(_: PortalState, f: FormData): Promise<PortalState> {
  try {
    const vesselId = String(f.get("vesselId") || "");
    const date = String(f.get("plannedStart") || "");
    if (!vesselId || !date) return { ok: false, message: "Gemi ve istenen tarih gerekli" };
    const [vessel] = await db.select().from(s.vessels).where(eq(s.vessels.id, vesselId));
    const decl = readDecl(f);
    const tariffs = await loadTariffs();
    const statuses = await ruleStatusMap();
    const when = istanbulDate(date);
    let version: ReturnType<typeof selectTariffVersion> | null = null;
    let tariffError: string | null = null;
    try { version = selectTariffVersion(tariffs, when.toISOString()); } catch (e) { tariffError = (e as Error).message; }
    const repair = f.get("repair") === "on";
    const fx = await getFxTable(when.toISOString(), undefined, { provisional: true, provisionalNote: "Tahmin — kur iş bitiş gününde kesinleşir" });
    const cab = String(f.get("isCabotage") || "");
    const cat = categorize({ vesselType: vessel?.vesselType, isCabotage: cab === "" ? null : cab === "1", isLinerService: f.get("isLiner") === "on" ? true : null });
    const holiday = holidayAt(when.toISOString());
    const minsToStart = (when.getTime() - Date.now()) / 60000;
    const cards: PackageCard[] = PACKAGES.map((p) => {
      const t = OPERATION_TYPES.find((x) => x.code === p.code)!;
      const notes: string[] = [];

      if (minsToStart < 360) notes.push("İstenen zaman 6 saatten yakın — olağan talep süresi (R-011, doğrulanıyor) karşılanmayabilir");
      if (p.needsRepair && !repair) notes.push("Bakım-onarım amacı belgelenmedikçe indirim uygulanmaz");
      const conds: string[] = [];
      if (decl.dgClass) conds.push("DANGEROUS_CARGO", isContainerOrRoro(vessel?.vesselType) ? "DANGEROUS_CARGO_CRP" : "DANGEROUS_CARGO_OTHER");
      if (vessel?.flag?.toUpperCase() === "TR") conds.push("TR_FLAG");
      if (holiday) { conds.push("HOLIDAY"); notes.push(`${holiday.name}: bayram/tatil artırımı uygulanabilir`); }
      if (cat.assumed) notes.push(`Kategori: ${cat.reason}`);
      if (p.needsRepair && repair) conds.push("REPAIR_YARD");
      if (decl.engine === "makinesiz") conds.push("NO_ENGINE");
      const lines = p.review || !version ? [] : t.kinds.filter((k) => ["PILOTAGE", "TOWAGE", "MOORING", "UNMOORING"].includes(k)).map((k) => {
        const input: CalcInput = { operationRef: "TAHMIN", serviceKind: k as ServiceKind, serviceDate: when.toISOString(), gt: decl.gt ?? null, measuredMinutes: 60, allocatedUnits: 1, requestedUnits: 1, extraUnitsWrittenRequest: false, conditionCodes: conds, completion: "COMPLETED", tariffCategory: cat.code, categoryReason: cat.reason, categoryAssumed: cat.assumed, fx };
        const r = calculate(input, version!, statuses);
        return { kind: k, amount: r.missing.length ? null : r.netAmount, missing: r.missing, eligible: r.productionEligible, cur: r.currency, tl: r.missing.length ? null : r.operational?.amount ?? null, op: r.operational };
      });
      const priced = lines.filter((l) => l.amount !== null);
      const total = lines.length && priced.length === lines.length ? priced.reduce((a, l) => a + Number(l.amount), 0).toFixed(2) : null;
      const totalTRY = total && lines.every((l) => l.tl !== null) ? lines.reduce((a, l) => a + Number(l.tl), 0).toFixed(2) : null;
      const op0 = lines.find((l) => l.op && l.cur !== "TRY")?.op;
      const fxNote = op0 ? `${lines[0].cur} × ${op0.rate} (${op0.rateSource}, ${op0.rateDate})` : total && !totalTRY ? "Kur bulunamadı — TL karşılığı hesaplanamadı" : null;
      if (tariffError) notes.push(tariffError);
      if (t.kinds.includes("TOWAGE")) notes.push("Römorkör sayısı emniyet değerlendirmesiyle kesinleşir; tahmin 1 römorkör × 1 saat varsayar");
      return {
        code: p.code, title: p.title, scope: p.scope, outOfScope: p.outOfScope, docs: p.docs, review: !!p.review,
        lines: lines.map(({ kind, amount, missing }) => ({ kind, amount, missing })), total, currency: lines[0]?.cur ?? version?.currency ?? "USD", totalTRY, fxNote, categoryReason: cat.reason,
        tariffLabel: version?.label ?? null, isDemoTariff: !!version?.isDemo, eligible: lines.length > 0 && lines.every((l) => l.eligible),
        missingInfo: missingInfo(decl, vessel?.vesselType), notes,
      };
    });
    const input = Object.fromEntries([...f.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$"))) as Record<string, string>;
    return { ok: true, cards, input };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export type SimpleState = { ok: boolean; message: string } | null;

export async function addToCart(_: SimpleState, f: FormData): Promise<SimpleState> {
  try {
    const partyId = await actingParty(f);
    const [cart] = await db.select().from(s.carts).where(and(eq(s.carts.partyId, partyId), eq(s.carts.status, "OPEN")));
    const cartId = cart?.id ?? (await db.insert(s.carts).values({ partyId }).returning())[0].id;
    const typeCode = String(f.get("typeCode"));
    const estimate = String(f.get("estimate") || "");
    await db.insert(s.cartItems).values({
      cartId, vesselId: String(f.get("vesselId")), typeCode, fromFacilityId: String(f.get("fromFacilityId") || "") || null,
      toFacilityId: String(f.get("toFacilityId") || "") || null, plannedStart: istanbulDate(String(f.get("plannedStart"))),
      declaration: readDecl(f), estimate: estimate ? { total: estimate, currency: String(f.get("currency") || "USD"), totalTRY: String(f.get("estimateTRY") || "") || null, at: new Date().toISOString() } : null,
    });
    revalidatePath("/portal");
    return { ok: true, message: "Sepete eklendi — bu bir rezervasyon değildir" };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

async function ownItem(itemId: string, partyId: string) {
  const [row] = await db.select({ item: s.cartItems, cart: s.carts }).from(s.cartItems).innerJoin(s.carts, eq(s.carts.id, s.cartItems.cartId)).where(eq(s.cartItems.id, itemId));
  if (!row || row.cart.partyId !== partyId || row.cart.status !== "OPEN") throw new Error("Sepet kalemi bulunamadı");
  return row;
}

export async function removeCartItem(_: SimpleState, f: FormData): Promise<SimpleState> {
  try {
    const partyId = await actingParty(f);
    const row = await ownItem(String(f.get("itemId")), partyId);
    await db.delete(s.cartItems).where(eq(s.cartItems.id, row.item.id));
    revalidatePath("/portal");
    return { ok: true, message: "Kalem çıkarıldı" };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function setItemBilling(_: SimpleState, f: FormData): Promise<SimpleState> {
  try {
    const partyId = await actingParty(f);
    const row = await ownItem(String(f.get("itemId")), partyId);
    const b = String(f.get("billingPartyId") || "");
    await db.update(s.cartItems).set({ billingPartyId: b || null }).where(eq(s.cartItems.id, row.item.id));
    revalidatePath("/portal");
    return { ok: true, message: b ? "Fatura muhatabı seçildi; ilgili firmanın onayı ayrıca istenecek" : "Muhatap temizlendi" };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

/** Sepeti gönder: her kalem ayrı operasyon olur. Tekrar gönderimde zaten oluşmuş kalemler atlanır. */
export async function submitCart(_: SimpleState, f: FormData): Promise<SimpleState> {
  let refs: string[] = [];
  let partyId = "";
  let external = false;
  try {
    partyId = await actingParty(f);
    const scope = await currentScope();
    external = scope.external;
    const [cart] = await db.select().from(s.carts).where(and(eq(s.carts.partyId, partyId), eq(s.carts.status, "OPEN")));
    if (!cart) return { ok: false, message: "Açık sepet yok" };
    const items = await db.select().from(s.cartItems).where(eq(s.cartItems.cartId, cart.id)).orderBy(asc(s.cartItems.createdAt));
    if (!items.length) return { ok: false, message: "Sepet boş" };
    for (const it of items) {
      if (it.operationId) continue; // tekrar gönderimde çoğaltma yok
      const r = await createOperationRecord({ vesselId: it.vesselId, typeCode: it.typeCode, fromFacilityId: it.fromFacilityId, toFacilityId: it.toFacilityId, plannedStart: it.plannedStart, requesterPartyId: partyId, billingPartyId: it.billingPartyId, declaration: it.declaration as Declaration, actor: scope.role, source: `cart:${cart.id}` });
      await db.update(s.cartItems).set({ operationId: r.id }).where(eq(s.cartItems.id, it.id));
      refs.push(r.ref);
    }
    await db.update(s.carts).set({ status: "SUBMITTED", submittedAt: new Date() }).where(eq(s.carts.id, cart.id));
    revalidatePath("/operasyonlar");
  } catch (e) { return { ok: false, message: (e as Error).message }; }
  const qs = new URLSearchParams({ gonderildi: refs.join(",") });
  if (!external) qs.set("firma", partyId);
  redirect(`/portal?${qs}`);
}
