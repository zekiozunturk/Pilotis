"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import type { Role } from "@/lib/workflow";
import { recordAudit } from "@/lib/ops";
import { loadVersion, runReferenceCases } from "@/lib/tariff/repo";
import { deriveByIndex, diffDefinitions, approvalBlockers, overlaps, syncServicesFromItems, type Rounding } from "@/lib/tariff/admin";
import { validatePriceList, CURRENCIES, type PriceItem, type Currency } from "@/lib/pricing/pricelist";
import type { TariffDefinition, ServiceKind } from "@/lib/tariff/types";

export type TState = { ok: boolean; message: string; at?: string } | null;
const ok = (message: string): TState => ({ ok: true, message, at: new Date().toISOString() });
const no = (message: string): TState => ({ ok: false, message });

async function need(roles: Role[]) {
  const r = await currentRole();
  if (r !== "SYSTEM_ADMIN" && !roles.includes(r)) throw new Error(`Bu işlem için yetkiniz yok (${ROLE_LABELS[r]})`);
  return r;
}
const EDITABLE = ["DRAFT", "SOURCE_FOUND"];
const trDate = (d: string, end = false) => new Date(`${d}T${end ? "23:59:59" : "00:00:00"}+03:00`);
async function wrap(fn: () => Promise<TState>): Promise<TState> { try { return await fn(); } catch (e) { return no((e as Error).message); } }

export async function deriveVersion(_: TState, f: FormData): Promise<TState> {
  let newId = "";
  const res = await wrap(async () => {
    const role = await need(["TARIFF_OFFICER"]);
    const parent = await loadVersion(String(f.get("parentId")));
    if (!parent) return no("Ana sürüm bulunamadı");
    const rate = String(f.get("ratePct") || "").replace(",", ".");
    const note = String(f.get("indexNote") || "").trim();
    const label = String(f.get("label") || "").trim();
    const from = String(f.get("validFrom") || ""), to = String(f.get("validTo") || "");
    if (!/^-?\d+(\.\d+)?$/.test(rate)) return no("Endeks oranı sayı olmalı (ör. 2.7)");
    if (!note) return no("Endeks oranının kaynağı (duyuru tarihi/sayısı) zorunlu");
    if (!label || !from || !to) return no("Etiket ve geçerlilik dönemi zorunlu");
    if (trDate(from) > trDate(to, true)) return no("Başlangıç bitişten sonra olamaz");
    const def = deriveByIndex(parent.input.definition, rate, String(f.get("rounding") || "CENT") as Rounding, note);
    const [row] = await db.insert(s.tariffVersions).values({
      familyId: parent.row.familyId, label, validFrom: trDate(from), validTo: trDate(to, true), currency: parent.row.currency, status: "DRAFT",
      definition: def, sourceRuleCodes: [...new Set([...parent.row.sourceRuleCodes, "R-028"])], parentVersionId: parent.row.id, preparedBy: role,
      changeNote: `${parent.row.label} × (1 + %${rate}) — ${note}`,
    }).returning();
    await recordAudit("tariff_version", row.id, "DERIVE_BY_INDEX", { parent: parent.row.id, rate, note }, role);
    newId = row.id;
    return ok("Taslak oluşturuldu");
  });
  if (newId) redirect(`/tarife/${newId}`);
  return res;
}

export async function saveDraft(_: TState, f: FormData): Promise<TState> {
  return wrap(async () => {
    const role = await need(["TARIFF_OFFICER"]);
    const v = await loadVersion(String(f.get("id")));
    if (!v) return no("Sürüm bulunamadı");
    if (!EDITABLE.includes(v.row.status)) return no("Yalnız taslak / kaynak bulundu statüsündeki sürüm düzenlenebilir; onaylı sürümden yeni sürüm türetin");
    if (Number(f.get("rev")) !== v.row.rev) return no(`Çakışma: sürüm siz düzenlerken başka biri tarafından kaydedildi (rev ${v.row.rev}). Sayfayı yenileyip değişiklikleri karşılaştırın.`);
    const before = v.input.definition;
    const def: TariffDefinition = structuredClone(before);
    const num = (k: string) => { const x = String(f.get(k) ?? "").trim().replace(",", "."); if (x === "") return null; if (!/^\d+(\.\d+)?$/.test(x)) throw new Error(`Geçersiz sayı: ${k} = "${x}"`); return x; };
    const apply = (key: string, svcs: Partial<Record<ServiceKind, import("@/lib/tariff/types").ServiceTariff>>) => {
      for (const [k, svc] of Object.entries(svcs)) {
        if (!svc) continue;
        svc.bands.forEach((b, i) => {
          const base = num(`${key}|${k}|${i}|base`); if (base !== null) b.base = base;
          const pb = num(`${key}|${k}|${i}|perBlock`); if (pb !== null && b.perBlock !== undefined) b.perBlock = pb;
        });
        const cap = num(`${key}|${k}|cap`); if (cap !== null) svc.gtCap = Number(cap);
        svc.bollardBands?.forEach((b) => { const r = num(`${key}|${k}|bp${b.fromT}`); if (r !== null) b.rate = r; });
      }
    };
    apply("_", def.services);
    for (const [ck, c] of Object.entries(def.categories ?? {})) apply(ck, c.services);
    // Fiyat listesi (tek doğruluk kaynağı): doğrula → hizmet eşlemesini kalemlerden kur
    let next: TariffDefinition = def;
    const rawItems = f.get("items");
    if (typeof rawItems === "string" && rawItems) {
      let parsed: PriceItem[];
      try { parsed = JSON.parse(rawItems); } catch { return no("Fiyat listesi verisi okunamadı"); }
      const items: PriceItem[] = parsed.map((i) => ({
        code: String(i.code ?? "").trim(), name: String(i.name ?? "").trim(), unit: String(i.unit ?? "").trim() || "Adet",
        currency: (CURRENCIES.includes(i.currency as Currency) ? i.currency : "TRY") as Currency,
        price: i.price != null && String(i.price).trim() !== "" ? String(i.price).trim().replace(",", ".") : null,
        formula: i.formula?.trim() ? i.formula.trim() : null,
        serviceKind: i.serviceKind || null, category: i.category || null, note: i.note?.trim() || null,
      }));
      const issues = validatePriceList(items);
      if (issues.length) return no(`Fiyat listesi kaydedilmedi — ${issues.length} hata: ${issues.slice(0, 6).map((i) => `[${i.code}] ${i.message}`).join(" · ")}`);
      def.items = items;
      const sync = syncServicesFromItems(def);
      if (sync.issues.length) return no(`Hizmet eşlemesi hatası: ${sync.issues.join(" · ")}`);
      next = sync.def;
    }
    Object.assign(def, next);
    for (const a of def.adjustments) { const r = num(`adj|${a.code}`); if (r !== null) { if (Number(r) > 3) throw new Error(`${a.label}: oran 0–3 arasında ondalık olmalı (0.20 = %20)`); a.rate = r; } }
    const label = String(f.get("label") || v.row.label).trim();
    const changes = diffDefinitions(before, def);
    if (!changes.length && label === v.row.label) return no("Değişiklik yok");
    const upd = await db.update(s.tariffVersions).set({ definition: def, label, rev: v.row.rev + 1 })
      .where(and(eq(s.tariffVersions.id, v.row.id), eq(s.tariffVersions.rev, v.row.rev))).returning({ id: s.tariffVersions.id });
    if (!upd.length) return no("Çakışma: kayıt başka biri tarafından değiştirildi");
    await recordAudit("tariff_version", v.row.id, "EDIT", { changes, label }, role, String(f.get("reason") || ""));
    revalidatePath(`/tarife/${v.row.id}`);
    return ok(`${changes.length} hücre güncellendi (rev ${v.row.rev + 1})`);
  });
}

export async function resolveNote(_: TState, f: FormData): Promise<TState> {
  return wrap(async () => {
    const role = await need(["TARIFF_OFFICER"]);
    const v = await loadVersion(String(f.get("id")));
    if (!v) return no("Sürüm bulunamadı");
    if (!EDITABLE.includes(v.row.status)) return no("Bu statüde not çözülemez");
    const resolution = String(f.get("resolution") || "").trim();
    if (resolution.length < 10) return no("Çözüm açıklaması ve dayanağı yazılmalı (en az 10 karakter)");
    const def: TariffDefinition = structuredClone(v.input.definition);
    const n = def.verificationNotes?.find((x) => x.id === f.get("noteId"));
    if (!n) return no("Not bulunamadı");
    n.resolved = true; n.resolution = `${resolution} — ${ROLE_LABELS[role]}, ${new Date().toLocaleDateString("tr-TR")}`;
    await db.update(s.tariffVersions).set({ definition: def, rev: v.row.rev + 1 }).where(eq(s.tariffVersions.id, v.row.id));
    await recordAudit("tariff_version", v.row.id, "RESOLVE_NOTE", { note: n.id, resolution }, role);
    revalidatePath(`/tarife/${v.row.id}`);
    return ok(`${n.id} çözüldü`);
  });
}

export async function addRefCase(_: TState, f: FormData): Promise<TState> {
  return wrap(async () => {
    const role = await need(["TARIFF_OFFICER"]);
    const id = String(f.get("id"));
    const g = (k: string) => String(f.get(k) ?? "").trim();
    const nz = (k: string) => (g(k) === "" ? null : Number(g(k).replace(",", ".")));
    if (!g("code") || !g("title") || !g("expected") || g("working").length < 5) return no("Kod, başlık, beklenen tutar ve hesap açıklaması zorunlu");
    const input = {
      serviceKind: g("serviceKind"), serviceDate: new Date(`${g("serviceDate")}T12:00:00+03:00`).toISOString(), gt: nz("gt"), measuredMinutes: nz("minutes"),
      allocatedUnits: Number(g("allocated") || 1), requestedUnits: Number(g("requested") || 1), extraUnitsWrittenRequest: f.get("written") === "on",
      conditionCodes: f.getAll("cond").map(String), completion: g("completion") || "COMPLETED", tariffCategory: g("category") || null, bollardPullT: nz("bollard"),
    };
    try {
      await db.insert(s.referenceCases).values({ code: g("code"), title: g("title"), tariffVersionId: id, source: g("source") as "INDEPENDENT_MANUAL", input, expected: g("expected").replace(",", "."), working: g("working"), preparedBy: role });
    } catch { return no("Bu sürümde aynı kodlu vaka var"); }
    await recordAudit("tariff_version", id, "ADD_REF_CASE", { code: g("code") }, role);
    revalidatePath(`/tarife/${id}`);
    return ok(`${g("code")} eklendi`);
  });
}

export async function transition(_: TState, f: FormData): Promise<TState> {
  return wrap(async () => {
    const to = String(f.get("to"));
    const reason = String(f.get("reason") || "").trim();
    const v = await loadVersion(String(f.get("id")));
    if (!v) return no("Sürüm bulunamadı");
    const from = v.row.status;
    const refs = await runReferenceCases(v.input);
    let role: Role;
    const patch: Partial<typeof s.tariffVersions.$inferInsert> = {};
    if (to === "EXPERT_REVIEW") {
      role = await need(["TARIFF_OFFICER"]);
      if (!EDITABLE.includes(from)) return no(`${from} statüsünden incelemeye gönderilemez`);
      const fails = refs.filter((r) => !r.pass);
      if (fails.length) return no(`Başarısız referans vakalar var: ${fails.map((r) => r.code).join(", ")}`);
      Object.assign(patch, { submittedBy: role, submittedAt: new Date() });
    } else if (to === "APPROVED") {
      role = await need(["BUSINESS_MANAGER"]);
      if (from !== "EXPERT_REVIEW") return no("Yalnız uzman incelemesindeki sürüm onaylanabilir");
      if (role === v.row.preparedBy || role === v.row.submittedBy) return no("Görev ayrılığı: hazırlayan / incelemeye gönderen kişi onaylayamaz");
      const b = approvalBlockers({ definition: v.input.definition, isDemo: v.row.isDemo }, refs);
      if (b.length) return no(`Onaylanamaz: ${b.join(" · ")}`);
      Object.assign(patch, { approvedBy: role, approvedAt: new Date() });
    } else if (to === "DRAFT") {
      role = await need(["BUSINESS_MANAGER", "TARIFF_OFFICER"]);
      if (from !== "EXPERT_REVIEW") return no("Yalnız incelemedeki sürüm taslağa iade edilir");
      if (!reason) return no("İade gerekçesi zorunlu");
    } else if (to === "IN_FORCE") {
      role = await need(["BUSINESS_MANAGER"]);
      if (from !== "APPROVED") return no("Yalnız onaylı sürüm yürürlüğe alınabilir");
      const siblings = await db.select().from(s.tariffVersions).where(and(eq(s.tariffVersions.familyId, v.row.familyId), ne(s.tariffVersions.id, v.row.id)));
      const clash = siblings.filter((x) => x.status === "IN_FORCE" && overlaps(x, v.row));
      if (clash.length) return no(`Aynı ailede dönemi çakışan yürürlükteki sürüm var: ${clash.map((c) => c.label).join(", ")} — önce yürürlükten kaldırın`);
      for (const d of siblings.filter((x) => x.isDemo && x.status !== "REPEALED" && overlaps(x, v.row))) {
        await db.update(s.tariffVersions).set({ status: "REPEALED" }).where(eq(s.tariffVersions.id, d.id));
        await recordAudit("tariff_version", d.id, "AUTO_REPEAL_DEMO", { replacedBy: v.row.id }, role, "Gerçek kaynaklı sürüm yürürlüğe girdi");
      }
      Object.assign(patch, { publishedBy: role, publishedAt: new Date() });
    } else if (to === "REPEALED") {
      role = await need(["BUSINESS_MANAGER"]);
      if (!reason) return no("Yürürlükten kaldırma gerekçesi zorunlu");
    } else return no("Geçersiz geçiş");
    await db.update(s.tariffVersions).set({ ...patch, status: to as "DRAFT", rev: v.row.rev + 1 }).where(eq(s.tariffVersions.id, v.row.id));
    await recordAudit("tariff_version", v.row.id, `STATUS:${from}->${to}`, { refs: refs.length, pass: refs.filter((r) => r.pass).length }, role, reason || undefined);
    revalidatePath(`/tarife/${v.row.id}`); revalidatePath("/tarife");
    return ok(`Statü: ${from} → ${to}`);
  });
}

export async function setRuleStatus(_: TState, f: FormData): Promise<TState> {
  return wrap(async () => {
    const to = String(f.get("to"));
    const code = String(f.get("code"));
    const checker = String(f.get("checker") || "").trim();
    const basis = String(f.get("basis") || "").trim();
    const role = await need(to === "APPROVED" || to === "IN_FORCE" ? ["BUSINESS_MANAGER"] : ["TARIFF_OFFICER"]);
    const [rule] = await db.select().from(s.businessRules).where(eq(s.businessRules.code, code));
    if (!rule) return no("Kural bulunamadı");
    const order = ["DRAFT", "SOURCE_FOUND", "EXPERT_REVIEW", "APPROVED", "IN_FORCE", "REPEALED"];
    if (to !== "REPEALED" && order.indexOf(to) !== order.indexOf(rule.status) + 1) return no(`${rule.status} → ${to} geçişi sıralı değil`);
    if (to === "SOURCE_FOUND" && basis.length < 5) return no("Kaynak (belge, madde) yazılmalı");
    if ((to === "EXPERT_REVIEW" || to === "APPROVED") && !checker) return no("Kontrol eden kişi yazılmalı");
    await db.update(s.businessRules).set({ status: to as "DRAFT", ...(basis ? { basis } : {}), updatedAt: new Date() }).where(eq(s.businessRules.code, code));
    await recordAudit("business_rule", code, `STATUS:${rule.status}->${to}`, { checker, basis }, role);
    revalidatePath("/kurallar");
    return ok(`${code}: ${rule.status} → ${to}`);
  });
}
