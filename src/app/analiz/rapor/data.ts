import "server-only";
import type { Analysis } from "../_lib";
import { peopleAndAssets } from "../_lib";
import { personSheet, assetSheet, opSheet } from "../tables";
import { bucketOf } from "@/lib/analytics/model";
import type { Field, DatasetKey } from "@/lib/analytics/report";
import type { Col } from "@/lib/excel";

const NOTIFY: Record<string, string> = { PREPARING: "Hazırlanıyor", READY: "Gönderime hazır", AWAITING_SEND: "Gönderim bekliyor", SENT: "Gönderildi", ACCEPTED: "Kabul edildi", REJECTED: "Reddedildi" };
const toField = (c: Col): Field => ({ key: c.key, label: c.header, type: c.type === "id" ? "id" : c.type, note: c.note });

/** Rapor tasarımcısının veri kümeleri — analiz tablolarıyla AYNI tanımlar ve aynı yetki süzmesi */
export function reportData(a: Analysis): Record<DatasetKey, { fields: Field[]; rows: Record<string, unknown>[] }> {
  const { ps, as } = peopleAndAssets(a);
  const out = {} as Record<DatasetKey, { fields: Field[]; rows: Record<string, unknown>[] }>;
  if (a.access.planning || a.access.finance) {
    const o = opSheet(a.sc, a.access);
    const extra: Field[] = [{ key: "day", label: "Gün", type: "text" }, { key: "week", label: "Hafta", type: "text" }, { key: "month", label: "Ay", type: "text" }, { key: "notify", label: "Resmî bildirim durumu", type: "text" }];
    out.ops = {
      fields: [...o.columns.map(toField), ...extra],
      rows: o.rows.map((r) => { const op = a.sc.ops.find((x) => x.ref === r._id); const d = r.date as number; return { ...r, day: bucketOf(d, "day"), week: bucketOf(d, "week"), month: bucketOf(d, "month"), notify: NOTIFY[op?.notifyStatus ?? ""] ?? op?.notifyStatus ?? "—" }; }),
    };
  }
  if (a.access.people !== "NONE") { const p = personSheet(a.sc, ps, a.access); out.persons = { fields: p.columns.map(toField), rows: p.rows }; }
  if (a.access.fleet) { const x = assetSheet(a.sc, as, a.access); out.assets = { fields: x.columns.map(toField), rows: x.rows }; }
  return out;
}
