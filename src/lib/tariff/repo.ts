import "server-only";
import { eq, asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { calculate } from "./engine";
import type { CalcInput, TariffVersionInput, CalcResult } from "./types";

export type VersionRow = typeof s.tariffVersions.$inferSelect;

export function toInput(r: VersionRow): TariffVersionInput {
  return { id: r.id, label: r.label, validFrom: r.validFrom.toISOString(), validTo: r.validTo.toISOString(), currency: r.currency, status: r.status, isDemo: r.isDemo, definition: r.definition as TariffVersionInput["definition"] };
}

export async function loadVersion(id: string) {
  const [row] = await db.select().from(s.tariffVersions).where(eq(s.tariffVersions.id, id));
  if (!row) return null;
  const [family] = await db.select().from(s.tariffFamilies).where(eq(s.tariffFamilies.id, row.familyId));
  return { row, family, input: toInput(row) };
}

export interface RefResult { id: string; code: string; title: string; source: string; expected: string; actual: string | null; pass: boolean; working: string; missing: string[]; result: CalcResult }

/** Referans vakaları sürüme karşı koşar. Beklenen değer kayıttan gelir; motor sonucu yalnız karşılaştırılır. */
export async function runReferenceCases(v: TariffVersionInput): Promise<RefResult[]> {
  const cases = await db.select().from(s.referenceCases).where(eq(s.referenceCases.tariffVersionId, v.id)).orderBy(asc(s.referenceCases.code));
  return cases.map((c) => {
    const r = calculate({ operationRef: c.code, ...(c.input as Omit<CalcInput, "operationRef">) }, v);
    const actual = r.missing.length ? null : r.netAmount;
    return { id: c.id, code: c.code, title: c.title, source: c.source, expected: Number(c.expected).toFixed(2), actual, pass: actual !== null && actual === Number(c.expected).toFixed(2), working: c.working, missing: r.missing, result: r };
  });
}
