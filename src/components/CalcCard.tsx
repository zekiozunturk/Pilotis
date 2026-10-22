import type { CalcResult } from "@/lib/tariff/types";
import { SERVICE_LABELS } from "@/data/catalog";
import { fmtMoney } from "@/lib/format";
import { displayAlt, fmtCcy, type DisplayLike } from "@/lib/money";

/** "Bu bedel neden oluştu?" — hesap dökümü tek kartta. */
export function CalcCard({ r, display }: { r: CalcResult; display?: DisplayLike | null }) {
  const op = r.operational;
  const alt = op && !r.missing.length ? displayAlt(op.amount, display) : null;
  return (
    <div className="calc">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>{SERVICE_LABELS[r.serviceKind]}</div>
          <div className="amount">{r.missing.length ? "—" : op ? fmtCcy(op.amount, "TRY") : <span style={{ color: "var(--warn)", fontSize: 16 }}>TL karşılığı yok (kur)</span>}</div>
          {!r.missing.length && r.currency !== "TRY" && <div style={{ fontSize: 12 }}>Liste: <b>{fmtMoney(r.netAmount, r.currency)}</b>{op ? ` × ${op.rate} (${op.rateSource}, ${op.rateDate})` : ""}</div>}
          {op?.provisional && <div><span className="badge warn" title={op.note}>Geçici kur — {op.note}</span></div>}
          {alt && <div className="muted" style={{ fontSize: 12 }}>{alt}</div>}
          <div className="muted" style={{ fontSize: 12 }}>{r.tariffLabel}{r.itemCode ? <> · kalem <span className="mono">[{r.itemCode}]</span></> : null}</div>
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
          {r.formulaTrace && r.formulaTrace.length > 0 && <tr><td className="muted">Formül</td><td className="mono" style={{ fontSize: 11.5 }}>{r.formulaTrace.map((t, i) => <div key={i}>{t}</div>)}</td></tr>}
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
