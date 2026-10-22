import { NextRequest } from "next/server";
import { analysis, peopleAndAssets } from "@/app/analiz/_lib";
import { personSheet, assetSheet, opSheet, resultSheet, costSheet, planSheet, financeMeta } from "@/app/analiz/tables";
import { buildWorkbook, xlsxResponse, type Sheet } from "@/lib/excel";
import { BASIS_LABEL, GRAIN_LABEL } from "@/lib/analytics/model";
import { ROLE_LABELS } from "@/lib/session";
import { db, schema as s } from "@/db";

export const dynamic = "force-dynamic";
const strip = (x: Sheet & { links?: unknown }): Sheet => ({ name: x.name, columns: x.columns, rows: x.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_")))), totals: x.totals, groupBy: x.groupBy, caption: x.caption });

export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const a = await analysis(Promise.resolve(sp));
  const tab = sp.tab ?? "ozet";
  const { ps, as, q } = peopleAndAssets(a);
  const sheets: Sheet[] = [];
  const need = (ok: boolean) => { if (!ok) throw new Response("Bu çıktı için yetkiniz yok", { status: 403 }); };
  try {
    if (tab === "personel" || tab === "ozet" || tab === "emniyet" || tab === "is-yuku") { need(a.access.people !== "NONE"); sheets.push(strip(personSheet(a.sc, ps, a.access))); }
    if (tab === "romorkor" || tab === "ozet") { need(a.access.fleet || tab === "ozet"); if (a.access.fleet) sheets.push(strip(assetSheet(a.sc, as, a.access))); }
    if (tab === "finans" || tab === "ozet") {
      if (tab === "finans") need(a.access.finance);
      if (a.access.finance) {
        sheets.push({ name: "Finans özeti", columns: [{ key: "k", header: "Gösterge", type: "text" }, { key: "v", header: "Tutar (TL)", type: "money" }], rows: financeMeta(a.sc).map(([k, v]) => ({ k, v: v / 100 })), totals: false, caption: `Tarih esası: ${BASIS_LABEL[a.f.basis]}` });
        sheets.push(strip(opSheet(a.sc, a.access)));
      }
      if (a.access.costs) { sheets.push(resultSheet(a.sc, "customer"), resultSheet(a.sc, "type"), resultSheet(a.sc, "night"), costSheet(a.sc)); }
    }
    if (tab === "plan" || tab === "bekleme") { need(a.access.planning); sheets.push(strip(planSheet(a.sc, a.access))); }
    if (tab === "ekip") { need(a.access.people === "ALL" || a.access.people === "TEAM"); sheets.push(strip(personSheet(a.sc, ps, a.access))); }
    if (!sheets.length) need(false);
  } catch (e) { if (e instanceof Response) return e; throw e; }
  const meta: [string, string][] = [
    ["Sekme", tab], ["Dönem", `${new Date(a.f.from).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })} – ${new Date(a.f.to - 1).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`],
    ["Tarih esası", BASIS_LABEL[a.f.basis]], ["Gruplama", GRAIN_LABEL[a.f.grain]], ["Uygulanan filtreler", Object.entries(sp).filter(([k]) => !["tab", "bas", "bit", "esas", "grup"].includes(k)).map(([k, v]) => `${k}=${v}`).join("; ") || "—"],
    ["Erişim kapsamı", `${a.access.label}${a.scopeNote ? ` — ${a.scopeNote}` : ""}`],
    ["Veri güncelliği", `Saha olayları ${q.lastUpdates.events ? new Date(q.lastUpdates.events).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—"}; muhasebe ${q.lastUpdates.accounting ? new Date(q.lastUpdates.accounting).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—"}`],
    ["Veri kalitesi", `Eksik zaman kaydı ${q.missingRecords}; onay bekleyen ${Math.round(q.pendingHours)} sa; finansal eşleşme ${q.financialMatchRate == null ? "—" : Math.round(q.financialMatchRate * 100) + "%"}; tahmini maliyet payı ${q.estimateShare == null ? "—" : Math.round(q.estimateShare * 100) + "%"}`],
    ["Hesaplama yöntemi", "Çakışan süreler bir kez sayılır; gece 20:00–06:00; gelir vergi hariç net fatura; dağıtılmış gelir kaynak tutarla kuruşu kuruşuna mutabıktır; 'katıldığı işlerin faturası' kişiler/araçlar arasında toplanamaz."],
    ["Uyarı", "ÖRNEK veri içerir (demo dönem) — resmî tarife ve TCMB kuru kullanılmamıştır."],
  ];
  const { buffer, reportId } = await buildWorkbook({ title: `PILOTIS · Analiz — ${tab}`, meta, sheets, preparedBy: ROLE_LABELS[a.role] });
  await db.insert(s.auditLog).values({ entity: "export", entityId: reportId, action: "EXPORT_XLSX", after: { tab, filters: sp, sheets: sheets.map((x) => x.name), rows: sheets.reduce((n, x) => n + x.rows.length, 0) }, actorId: a.role });
  return xlsxResponse(buffer, `PILOTIS_ANALIZ_${tab.toUpperCase()}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`);
}
