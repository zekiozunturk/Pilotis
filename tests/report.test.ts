import { describe, it, expect } from "vitest";
import { runReport, validateDef, EMPTY_DEF, type Field, type ReportDef } from "@/lib/analytics/report";

const fields: Field[] = [{ key: "team", label: "Ekip", type: "text" }, { key: "role", label: "Rol", type: "text" }, { key: "actual", label: "Gerçekleşen", type: "hours" }, { key: "ot", label: "Fazla mesai", type: "hours" }];
const rows = [
  { _id: "1", team: "A", role: "K", actual: 100, ot: 10 }, { _id: "2", team: "A", role: "P", actual: 50, ot: 0 },
  { _id: "3", team: "B", role: "K", actual: 40, ot: 20 }, { _id: "4", team: "B", role: "P", actual: null, ot: 5 },
];
const def = (p: Partial<ReportDef>): ReportDef => ({ ...EMPTY_DEF, dataset: "persons", ...p });

describe("Rapor motoru", () => {
  it("gruplar, toplar ve oranı toplamlardan hesaplar (ortalamaların oranı değil)", () => {
    const r = runReport(def({ groupBy: "team", measures: [{ key: "actual", agg: "sum" }, { key: "ot", agg: "sum" }, { key: "actual", agg: "avg" }], ratios: [{ num: "ot", den: "actual", label: "FM oranı" }] }), rows, fields);
    const A = r.rows.find((x) => x._id === "A")!, B = r.rows.find((x) => x._id === "B")!;
    expect(A["sum:actual"]).toBe(150); expect(A["ratio:ot/actual"]).toBeCloseTo(10 / 150);
    expect(B["avg:actual"]).toBe(40);                  // boş değer sıfır sayılmaz
    expect(r.totals["sum:actual"]).toBe(190); expect(r.totals["ratio:ot/actual"]).toBeCloseTo(35 / 190);
    expect(r.totals["avg:actual"]).toBeCloseTo(190 / 3); // genel ortalama, grup ortalamalarının ortalaması değil
  });
  it("pivot kolonları ve toplamları", () => {
    const r = runReport(def({ groupBy: "team", pivot: "role", measures: [{ key: "_count", agg: "count" }] }), rows, fields);
    expect(r.columns.map((c) => c.key)).toEqual(["team", "count:_count", "pv:K", "pv:P"]);
    expect(r.totals["pv:K"]).toBe(2); expect(r.totals["count:_count"]).toBe(4);
  });
  it("detay modu ve doğrulama", () => {
    const r = runReport(def({ groupBy: null, measures: [{ key: "actual", agg: "sum" }], sort: { col: "actual", dir: "desc" } }), rows, fields);
    expect(r.rows[0]._id).toBe("1"); expect(r.totals.actual).toBe(190);
    expect(validateDef(def({ pivot: "role", groupBy: null }), fields)).toContain("Pivot için önce gruplama seçilmeli");
    expect(validateDef(def({ groupBy: "team", measures: [{ key: "actual", agg: "sum" }], ratios: [{ num: "ot", den: "actual", label: "x" }] }), fields).length).toBe(1);
  });
});
