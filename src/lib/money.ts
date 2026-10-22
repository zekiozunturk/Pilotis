/** İstemci/sunucu ortak biçimlendirme — TL ana, döviz bilgi amaçlı */
export interface DisplayLike { ccy: "TRY" | "USD" | "EUR"; rate: string | null; source: string | null; date: string | null }
export const fmtCcy = (v: string | number, c: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: c, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
export function displayAlt(tryAmount: string | null, d?: DisplayLike | null): string | null {
  if (!tryAmount || !d || d.ccy === "TRY") return null;
  if (!d.rate) return `${d.ccy} kuru yok`;
  return `≈ ${fmtCcy(Number(tryAmount) / Number(d.rate), d.ccy)} (${d.source}, ${d.date} — bilgi amaçlı)`;
}
