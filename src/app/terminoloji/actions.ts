"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { recordAudit } from "@/lib/ops";

export type TState = { ok: boolean; message: string; at?: string } | null;
const EDITORS = ["SYSTEM_ADMIN", "BUSINESS_MANAGER", "TARIFF_OFFICER", "OPERATIONS_MANAGER"];
const LANGS = ["en", "de", "it", "nb", "ar"];

export async function reviewTranslation(_: TState, f: FormData): Promise<TState> {
  const role = await currentRole();
  if (!EDITORS.includes(role)) return { ok: false, message: `Yetkiniz yok (${ROLE_LABELS[role]})` };
  const n = Number(f.get("n")), lang = String(f.get("lang")), text = String(f.get("text") || "").trim(), reviewer = String(f.get("reviewer") || "").trim();
  if (!LANGS.includes(lang)) return { ok: false, message: "Geçersiz dil" };
  if (!text) return { ok: false, message: "Çeviri boş olamaz" };
  if (reviewer.length < 3) return { ok: false, message: "Kontrol eden kişi (ad / unvan) zorunlu — yapay zekâ çevirisi insan kontrolü olmadan onaylanamaz" };
  const [t] = await db.select().from(s.terms).where(eq(s.terms.number, n));
  if (!t) return { ok: false, message: "Terim bulunamadı" };
  const tr = { ...(t.translations as Record<string, { text: string; reviewed: boolean }>) };
  tr[lang] = { text, reviewed: true, reviewer, reviewedAt: new Date().toISOString() } as { text: string; reviewed: boolean };
  const all = LANGS.every((l) => tr[l]?.reviewed);
  await db.update(s.terms).set({ translations: tr, version: t.version + 1, status: all ? "ONAYLI" : "KISMEN_ONAYLI" }).where(eq(s.terms.number, n));
  await recordAudit("term", String(n), "REVIEW_TRANSLATION", { lang, text, reviewer, before: (t.translations as Record<string, unknown>)[lang] }, role);
  revalidatePath("/terminoloji");
  return { ok: true, message: `#${n} ${lang.toUpperCase()} onaylandı (v${t.version + 1})`, at: new Date().toISOString() };
}

export async function addTerm(_: TState, f: FormData): Promise<TState> {
  const role = await currentRole();
  if (!EDITORS.includes(role)) return { ok: false, message: `Yetkiniz yok (${ROLE_LABELS[role]})` };
  const g = (k: string) => String(f.get(k) || "").trim();
  if (!g("tr") || g("definition").length < 10) return { ok: false, message: "Türkçe terim ve en az 10 karakterlik tanım zorunlu" };
  const slug = g("tr").toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" } as Record<string, string>)[c]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const r = await db.execute<{ n: number }>(sql`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM terms`);
  const n = Number(r.rows[0].n);
  try {
    await db.insert(s.terms).values({ number: n, slug, tr: g("tr"), aliases: g("aliases") ? g("aliases").split(",").map((x) => x.trim()).filter(Boolean) : [], definition: g("definition"), source: g("source") || null, confusedWith: g("confused") || null,
      translations: Object.fromEntries(LANGS.map((l) => [l, { text: g(l), reviewed: false }])), status: "TASLAK" });
  } catch { return { ok: false, message: "Bu terim zaten var" }; }
  await recordAudit("term", String(n), "CREATE", { tr: g("tr") }, role);
  revalidatePath("/terminoloji");
  return { ok: true, message: `#${n} "${g("tr")}" eklendi — numara kalıcıdır`, at: new Date().toISOString() };
}

/**
 * Terim düzenleme — numara değişmez. Türkçe metin/tanım değişirse sürüm artar; bir dilin çevirisi
 * değişirse o dilin onayı düşer (yeniden insan kontrolü gerekir). Önceki hâl denetim kaydında saklanır.
 */
export async function editTerm(_: TState, f: FormData): Promise<TState> {
  const role = await currentRole();
  if (!EDITORS.includes(role)) return { ok: false, message: `Yetkiniz yok (${ROLE_LABELS[role]})` };
  const g = (k: string) => String(f.get(k) || "").trim();
  const n = Number(f.get("n"));
  const [t] = await db.select().from(s.terms).where(eq(s.terms.number, n));
  if (!t) return { ok: false, message: "Terim bulunamadı" };
  if (!g("tr") || g("definition").length < 10) return { ok: false, message: "Türkçe terim ve en az 10 karakterlik tanım zorunlu" };
  if (g("changeNote").length < 5) return { ok: false, message: "Değişiklik notu zorunlu (ne neden değişti?)" };
  const before = t.translations as Record<string, { text: string; reviewed: boolean; reviewer?: string }>;
  const tr: typeof before = {};
  const resetLangs: string[] = [];
  for (const l of LANGS) {
    const text = g(`t_${l}`), prev = before[l];
    if (prev && prev.text === text) tr[l] = prev;
    else { tr[l] = { text, reviewed: false }; if (prev?.reviewed) resetLangs.push(l.toUpperCase()); }
  }
  const all = LANGS.every((l) => tr[l]?.reviewed), some = LANGS.some((l) => tr[l]?.reviewed);
  const next = {
    tr: g("tr"), aliases: g("aliases") ? g("aliases").split(",").map((x) => x.trim()).filter(Boolean) : [],
    definition: g("definition"), source: g("source") || null, confusedWith: g("confused") || null,
  };
  const changed = next.tr !== t.tr || next.definition !== t.definition || next.source !== t.source || next.confusedWith !== t.confusedWith || next.aliases.join("|") !== t.aliases.join("|") || JSON.stringify(tr) !== JSON.stringify(before);
  if (!changed) return { ok: false, message: "Değişiklik yok" };
  await db.update(s.terms).set({ ...next, translations: tr, version: t.version + 1, status: all ? "ONAYLI" : some ? "KISMEN_ONAYLI" : "TASLAK" }).where(eq(s.terms.number, n));
  await recordAudit("term", String(n), "UPDATE", { before: { tr: t.tr, aliases: t.aliases, definition: t.definition, source: t.source, confusedWith: t.confusedWith, translations: before }, after: { ...next, translations: tr }, note: g("changeNote") }, role);
  revalidatePath("/terminoloji");
  return { ok: true, message: `#${n} güncellendi (v${t.version + 1})${resetLangs.length ? ` — ${resetLangs.join(", ")} çevirisi değiştiği için yeniden onay bekliyor` : ""}`, at: new Date().toISOString() };
}
