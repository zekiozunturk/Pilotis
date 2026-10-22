/** Dosya adlandırma: TIP_GEMI_YYYYMMDD_OP000456_V02.pdf ("ters tarih" = YYYYMMDD). */
const TR: Record<string, string> = { ç: "C", Ç: "C", ğ: "G", Ğ: "G", ı: "I", İ: "I", ö: "O", Ö: "O", ş: "S", Ş: "S", ü: "U", Ü: "U" };

export function slug(s: string): string {
  return s.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR[c]).normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "GEMI";
}

/** Europe/Istanbul takvim günü (UTC+3, yaz saati yok) */
export function ymdIstanbul(d: Date): string {
  const t = new Date(d.getTime() + 3 * 3600_000);
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}
export function ymdHmsIstanbul(d: Date): string {
  const t = new Date(d.getTime() + 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ymdIstanbul(d)}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

export function opCompact(ref: string): string {
  // OP-2026-000456 → OP000456
  const m = ref.match(/OP-\d{4}-(\d+)/);
  return m ? `OP${m[1]}` : slug(ref);
}

export function docFileName(docType: string, vesselName: string, date: Date, opRef: string, version: number, ext = "pdf"): string {
  return `${slug(docType)}_${slug(vesselName)}_${ymdIstanbul(date)}_${opCompact(opRef)}_V${String(version).padStart(2, "0")}.${ext}`;
}

/** Saha medyası: ROMORKOR_GEMI_20261022T143000_000123.jpg */
export function mediaFileName(assetName: string, vesselName: string, takenAt: Date, seq: number, ext: string): string {
  return `${slug(assetName)}_${slug(vesselName)}_${ymdHmsIstanbul(takenAt)}_${String(seq).padStart(6, "0")}.${ext.toLowerCase()}`;
}
