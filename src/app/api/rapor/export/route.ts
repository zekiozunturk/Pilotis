import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, ROLE_LABELS, requireInternalPage } from "@/lib/session";
import { analyticsAccess } from "@/lib/analytics/access";
import { buildWorkbook, xlsxResponse, type ColType } from "@/lib/excel";
import { tablePdf } from "@/lib/docs/table-pdf";
import type { ReportDef, Field } from "@/lib/analytics/report";
import { computeReport, cellText } from "@/app/analiz/rapor/compute";

export const dynamic = "force-dynamic";

/** Rapor çıktısı: kayıtlı rapor (id), tasarımcıdaki taslak (def) veya SABİT NÜSHA (değişmez satırlar) */
export async function GET(req: NextRequest) {
  await requireInternalPage();
  const q = req.nextUrl.searchParams;
  const format = q.get("format") === "pdf" ? "pdf" : "xlsx";
  const role = await currentRole();
  const acc = analyticsAccess(role);
  if (!acc.reports) return new Response("Rapor yetkiniz yok", { status: 403 });
  let def: ReportDef, columns: Field[], rows: Record<string, unknown>[], totals: Record<string, number | null>, meta: [string, string][], reportNo: string | null = null;
  const id = q.get("id");
  if (id) {
    const [r] = await db.select().from(s.reports).where(eq(s.reports.id, id));
    if (!r) return new Response("Rapor bulunamadı", { status: 404 });
    if (r.scope === "PERSONAL" && r.ownerRole !== role) return new Response("Bu rapor kişiseldir", { status: 403 });
    def = r.definition as ReportDef;
    if (r.kind === "SNAPSHOT") {
      const snap = r.snapshot as { reportNo: string; generatedAt: string; columns: Field[]; rows: Record<string, unknown>[]; totals: Record<string, number | null>; meta: [string, string][] };
      // Nüsha değişmez; ancak görüntüleyenin yetkisi daha dar ise finansal kolonlar gizlenir
      columns = acc.finance ? snap.columns : snap.columns.filter((c) => c.type !== "money");
      rows = snap.rows; totals = snap.totals; meta = [["Sabit nüsha", `${snap.reportNo} · üretim ${new Date(snap.generatedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · hazırlayan ${r.owner}`], ...snap.meta];
      reportNo = snap.reportNo;
    } else {
      const c = await computeReport(def, r.kind === "VIEW" ? r.filters ?? "" : q.get("filters") ?? "");
      ({ columns, rows, totals } = c.out); meta = c.meta;
    }
  } else {
    try { def = JSON.parse(Buffer.from(q.get("def") ?? "", "base64url").toString("utf8")); } catch { return new Response("Geçersiz rapor tanımı", { status: 400 }); }
    try { const c = await computeReport(def, q.get("filters") ?? ""); ({ columns, rows, totals } = c.out); meta = c.meta; } catch (e) { return new Response((e as Error).message, { status: 403 }); }
  }
  const name = `PILOTIS_RAPOR_${def.title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40)}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const metaAll: [string, string][] = [...(def.description ? [["Açıklama", def.description] as [string, string]] : []), ...meta, ...(def.footnote ? [["Dipnot", def.footnote] as [string, string]] : [])];
  if (format === "xlsx") {
    const totalsRow = Object.keys(totals).length ? { ...Object.fromEntries(columns.map((c) => [c.key, totals[c.key] ?? null])), [columns[0].key]: "Genel toplam" } : null;
    const { buffer, reportId } = await buildWorkbook({ title: def.title, meta: metaAll, preparedBy: ROLE_LABELS[role], sheets: [{ name: def.title, columns: columns.map((c) => ({ key: c.key, header: c.label, type: (c.type === "date" ? "text" : c.type) as ColType, note: c.note })), rows: totalsRow ? [...rows, totalsRow] : rows, totals: false, caption: def.description || undefined }] });
    await db.insert(s.auditLog).values({ entity: "export", entityId: reportNo ?? reportId, action: "REPORT_XLSX", after: { title: def.title, rows: rows.length, id }, actorId: role });
    return xlsxResponse(buffer, `${name}.xlsx`);
  }
  const reportId = reportNo ?? `RPR-${Date.now().toString(36).toUpperCase()}`;
  const m0 = columns[1];
  const pdf = await tablePdf({
    title: def.title, description: def.description, footnote: def.footnote, logo: def.logo,
    meta: [["Rapor kimliği", reportId], ["Üretim", new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })], ...meta],
    columns: columns.map((c) => ({ label: c.label, numeric: ["int", "number", "money", "hours", "pct"].includes(c.type) })),
    rows: rows.map((r) => columns.map((c) => cellText(r[c.key], c.type))),
    totals: Object.keys(totals).length ? columns.map((c, i) => (i === 0 ? "Genel toplam" : totals[c.key] == null ? "" : cellText(totals[c.key], c.type))) : null,
    chart: def.sections.includes("chart") && def.groupBy && m0 ? rows.slice(0, 15).map((r) => ({ label: String(r[columns[0].key] ?? ""), value: Number(r[m0.key]) || 0 })) : undefined,
  });
  await db.insert(s.auditLog).values({ entity: "export", entityId: reportId, action: "REPORT_PDF", after: { title: def.title, rows: rows.length, id }, actorId: role });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.pdf`, "cache-control": "no-store" } });
}
