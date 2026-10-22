import type { CalcResult } from "@/lib/tariff/types";
import { SERVICE_LABELS } from "@/data/catalog";
import { fmtMoney } from "@/lib/format";

/** "Bu bedel neden oluştu?" — hesap dökümü tek kartta. */
export function CalcCard({ r }: { r: CalcResult }) {
  return (
    <div className="calc">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>{SERVICE_LABELS[r.serviceKind]}</div>
          <div className="amount">{r.missing.length ? "—" : fmtMoney(r.netAmount, r.currency)}</div>
          <div className="muted" style={{ fontSize: 12 }}>{r.tariffLabel}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          {r.productionEligible ? <span className="badge ok">Üretime uygun</span> : <span className="badge warn">İnceleme kuyruğu</span>}
          <div className="mono muted" style={{ marginTop: 4 }}>{r.calcId}</div>
        </div>
      </div>
      {r.missing.length === 0 && <><div className="sep" />
      <table style={{ fontSize: 12.5 }}>
        <tbody>
          <tr><td className="muted">Kategori gerekçesi</td><td>{r.categoryReason}</td></tr>
          <tr><td className="muted">Esas birim bedel</td><td>{r.missing.length ? "—" : fmtMoney(r.baseAmount, r.currency)}</td></tr>
          <tr><td className="muted">Ölçülen miktar</td><td>{r.measuredQuantity ? `${r.measuredQuantity} saat` : "Olay başına"}</td></tr>
          <tr><td className="muted">Ücretlendirilen</td><td>{r.billedQuantity} × {r.billedUnits} birim</td></tr>
          <tr><td className="muted">Net oran düzeltmesi</td><td>{(Number(r.adjustmentRate) * 100).toFixed(0)}%</td></tr>
        </tbody>
      </table></>}
      {r.rules.length > 0 && <>
        <div className="sep" />
        <h3>Değerlendirilen kurallar</h3>
        {r.rules.map((x, i) => (
          <div className="rule" key={i}>
            <span className="c">{x.ruleCode}</span>
            <span aria-label={x.applied ? "uygulandı" : "uygulanmadı"} style={{ color: x.applied ? "var(--ok)" : "var(--muted)" }}>{x.applied ? "✓" : "–"}</span>
            <span><b>{x.description}:</b> {x.reason}</span>
          </div>
        ))}
      </>}
      {(r.missing.length > 0 || r.productionBlockers.length > 0) && <>
        <div className="sep" />
        <div className="alert warn"><span>⚠</span><div><b>Eksik / engel</b>{[...new Set([...r.missing, ...r.productionBlockers])].join(" · ")}</div></div>
      </>}
    </div>
  );
}
