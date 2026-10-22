import "server-only";
import { cache } from "react";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";

export type TermRow = typeof s.terms.$inferSelect;
export const getTerms = cache(async (): Promise<Map<number, TermRow>> => {
  const rows = await db.select().from(s.terms).orderBy(asc(s.terms.number));
  return new Map(rows.map((r) => [r.number, r]));
});
