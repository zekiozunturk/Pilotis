import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { currentPersonId, currentRole, requireInternalPage } from "@/lib/session";
import type { Role } from "@/lib/workflow";
import { analyticsAccess } from "@/lib/analytics/access";
import { loadDataset, parseFilter, comparisonFilter, type SP } from "@/lib/analytics/load";
import { makeScope, personStats, assetStats, type Filter } from "@/lib/analytics/model";
import { quality } from "@/lib/analytics/insights";
import { H } from "@/lib/analytics/core";

/** Bütün analiz ekranlarının ortak girişi: yetki, kapsam (kendi/ekip), filtre, karşılaştırma dönemi */
export async function analysis(spP: Promise<SP>, as?: { role: Role; person?: string | null }) {
  if (!as) await requireInternalPage();
  const sp = await spP;
  const role = as?.role ?? (await currentRole());
  const access = analyticsAccess(role);
  if (!access.any) { if (as) throw new Error("Erişim yok"); notFound(); }
  const f = parseFilter(sp);
  const cmp = comparisonFilter(f, sp);
  const ds = await loadDataset({ from: Math.min(f.from, cmp?.from ?? f.from), to: f.to });
  const me = as ? as.person ?? null : await currentPersonId();
  let scopeNote: string | null = null;
  const restrict = (x: Filter) => {
    if (access.people === "SELF") { x.personnelIds = me ? [me] : ["__none__"]; scopeNote = "Yalnız kendi görev ve çalışma kayıtlarınız gösterilir."; }
    if (access.people === "TEAM") {
      const team = me ? ds.persons.find((p) => p.id === me)?.teamKey : null;
      x.teamKeys = team ? [team] : ["__none__"]; scopeNote = `Yetkili olduğunuz ekip: ${team ?? "tanımsız"}.`;
    }
    return x;
  };
  restrict(f); if (cmp) restrict(cmp);
  const sc = makeScope(ds, f);
  return { sp, role, access, f, cmp, ds, sc, me, scopeNote, csc: cmp ? makeScope(ds, cmp) : null };
}
export type Analysis = Awaited<ReturnType<typeof analysis>>;

export function peopleAndAssets(a: Analysis) {
  const ps = a.sc.persons.map((p) => personStats(a.sc, p));
  const as = a.sc.assets.map((x) => assetStats(a.sc, x));
  return { ps, as, q: quality(a.sc, ps) };
}

export const tl = (c: number) => `${(c / 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
export const tlc = (c: number) => (Math.abs(c) >= 1e8 ? `${(c / 1e8).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} Mn TL` : tl(c));
export const hh = (ms: number) => (ms / H).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
export const pct = (x: number | null) => (x == null ? "—" : `%${(x * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`);
export const dt = (ms: number | null) => (ms == null ? "—" : new Date(ms).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }));
export const dd = (ms: number) => new Date(ms).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
/** Filtreyi koruyarak bağlantı üret */
export function qs(sp: SP, patch: Record<string, string | null> = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) u.set(k, v);
  for (const [k, v] of Object.entries(patch)) if (v == null) u.delete(k); else u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}
