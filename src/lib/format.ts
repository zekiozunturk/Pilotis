const TZ = "Europe/Istanbul";
export const fmtDT = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(d)) : "—";
export const fmtTime = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—";
export const fmtNum = (v: string | number | null | undefined, digits = 0) =>
  v === null || v === undefined || v === "" ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(Number(v));
export const fmtMoney = (v: string, cur: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(Number(v));
export const fmtMin = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`);
