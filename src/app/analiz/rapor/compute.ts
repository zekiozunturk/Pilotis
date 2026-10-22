import "server-only";
import { analysis, type Analysis } from "../_lib";
import { reportData } from "./data";
import { runReport, validateDef, type ReportDef, type ReportOut } from "@/lib/analytics/report";
import { BASIS_LABEL } from "@/lib/analytics/model";
import { ROLE_LABELS } from "@/lib/session";
import type { SP } from "@/lib/analytics/load";
import type { Role } from "@/lib/workflow";

export interface Computed { out: ReportOut; meta: [string, string][]; a: Analysis }
/** Raporu GÜNCEL kullanıcının yetkisi ve verilen filtrelerle sunucuda hesaplar */
export async function computeReport(def: ReportDef, filters: string, as?: { role: Role }): Promise<Computed> {
  const sp: SP = Object.fromEntries(new URLSearchParams(filters).entries());
  const a = await analysis(Promise.resolve(sp), as);
  const data = reportData(a);
  const ds = data[def.dataset];
  if (!ds) throw new Error("Bu veri kümesine erişim yetkiniz yok");
  const errs = validateDef(def, ds.fields);
  if (errs.length) throw new Error(errs.join("; "));
  const out = runReport(def, ds.rows, ds.fields);
  const meta: [string, string][] = [
    ["Dönem", `${new Date(a.f.from).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })} – ${new Date(a.f.to - 1).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}`],
    ["Tarih esası", BASIS_LABEL[a.f.basis]], ["Filtreler", filters || "—"], ["Erişim", a.access.label], ["Hazırlayan", ROLE_LABELS[a.role]],
    ["Veri/kural sürümleri", `gelir dağıtımı v${a.ds.alloc.version} (${a.ds.alloc.method}); dinlenme profilleri STCW_MLC/IS_KANUNU; ölçüm sözlüğü v1; veri hesap zamanı ${new Date(a.ds.asOf).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`],
    ["Not", "ÖRNEK veri içerebilir; muhasebe kârı/zararı değildir."],
  ];
  return { out, meta, a };
}

export function cellText(v: unknown, type: string) {
  if (v == null || v === "") return "—";
  if (type === "money") return Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  if (type === "hours" || type === "number") return Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  if (type === "int") return Number(v).toLocaleString("tr-TR");
  if (type === "pct") return `%${(Number(v) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
  if (type === "datetime") return new Date(Number(v)).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  return String(v);
}
