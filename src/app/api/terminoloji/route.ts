import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope } from "@/lib/session";

/** CSV (Excel uyumlu, UTF-8 BOM). Formül enjeksiyonuna karşı = + - @ ile başlayan hücreler kaçışlanır. */
const cell = (v: unknown) => {
  let x = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`;
  return `"${x.replace(/"/g, '""')}"`;
};

export async function GET() {
  if ((await currentScope()).external) return new Response("Bulunamadı", { status: 404 });
  const rows = await db.select().from(s.terms).orderBy(asc(s.terms.number));
  const head = ["No", "Türkçe", "İşletme karşılıkları", "Tanım", "Kaynak", "Karıştırılan", "EN", "DE", "IT", "NB", "AR", "Durum", "Sürüm"];
  const lines = rows.map((r) => {
    const t = r.translations as Record<string, { text: string; reviewed: boolean }>;
    const tx = (l: string) => `${t[l]?.text ?? ""}${t[l]?.reviewed ? "" : " [taslak]"}`;
    return [r.number, r.tr, r.aliases.join("; "), r.definition, r.source, r.confusedWith, tx("en"), tx("de"), tx("it"), tx("nb"), tx("ar"), r.status, r.version].map(cell).join(";");
  });
  const body = "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="PILOTIS_TERMINOLOJI_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv"` } });
}
