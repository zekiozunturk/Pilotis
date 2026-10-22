/**
 * Uyarılar, iş yükü dengesi, veri kalitesi ve otomatik değerlendirme.
 * Değerlendirmeler kaynak kayıtlara bağlantı verir; tahmini nedeni kesin bulgu gibi sunmaz,
 * disiplin/ücret/prim kararı üretmez. Az görev alan araç veya izinli personel "düşük performans" sayılmaz.
 */
import { H, DAY, trDay, dayStart } from "./core";
import { type Scope, type PersonStats, type AssetStats, opFinance, financeSummary } from "./model";

export interface AlertCfg {
  concentrationRatio: number;   // kişinin saati, aynı roldeki ortalamanın kaç katı
  nightShareMax: number;        // kişinin gece payı (çalışmanın)
  overtimeHoursPerWeek: number;
  tugImbalanceRatio: number;    // aynı gruptaki araçlar arası kullanım oranı farkı
  waitMinutes: number;          // tek işte olağan dışı bekleme
  unbilledDays: number;         // tamamlanıp faturalanmamış iş
  invoiceDiffPct: number;
  fuelDeviationPct: number;
  accountingStaleDays: number;
}
export const DEFAULT_ALERTS: AlertCfg = { concentrationRatio: 1.25, nightShareMax: 0.6, overtimeHoursPerWeek: 6, tugImbalanceRatio: 0.5, waitMinutes: 90, unbilledDays: 10, invoiceDiffPct: 1, fuelDeviationPct: 15, accountingStaleDays: 3 };
export const ALERT_LABEL: Record<keyof AlertCfg, string> = {
  concentrationRatio: "İş yükü yoğunlaşması (rol ortalamasının katı)", nightShareMax: "Gece çalışması payı üst sınırı", overtimeHoursPerWeek: "Haftalık fazla mesai (saat)",
  tugImbalanceRatio: "Römorkör kullanım dengesizliği (oran farkı)", waitMinutes: "Olağan dışı bekleme (dk)", unbilledDays: "Faturalanmamış iş (gün)",
  invoiceDiffPct: "Fatura–tahakkuk farkı (%)", fuelDeviationPct: "Yakıt sapması (%)", accountingStaleDays: "Muhasebe verisi güncelliği (gün)",
};

export type Severity = "CRITICAL" | "WARNING" | "INFO";
export interface Alert { code: string; severity: Severity; title: string; detail: string; links: { label: string; href: string }[]; area: "EMNİYET" | "İŞ YÜKÜ" | "FİNANS" | "VERİ" | "FİLO" }

export function alertsFor(sc: Scope, ps: PersonStats[], as: AssetStats[], cfg: AlertCfg = DEFAULT_ALERTS): Alert[] {
  const out: Alert[] = [];
  const { ds, f } = sc;
  const weeks = Math.max(1, (f.to - f.from) / (7 * DAY));
  // Dinlenme
  const restP = ps.filter((x) => x.violations.some((v) => v.severity === "ERROR"));
  if (restP.length > 5) {
    const byTeam = new Map<string, number>();
    for (const p of restP) byTeam.set(p.person.teamKey ?? p.person.crewRole ?? "-", (byTeam.get(p.person.teamKey ?? p.person.crewRole ?? "-") ?? 0) + 1);
    const codes = new Map<string, number>();
    for (const p of restP) for (const v of p.violations.filter((x) => x.severity === "ERROR")) codes.set(v.message.replace(/\(.*\)$/, "").replace(/\d+ sa \d+ dk </, "… <").trim(), (codes.get(v.message.replace(/\(.*\)$/, "").replace(/\d+ sa \d+ dk </, "… <").trim()) ?? 0) + 1);
    out.push({ code: "REST", severity: "CRITICAL", area: "EMNİYET", title: `${restP.length} kişide dinlenme uygunluk sorunu`, detail: `Etkilenen ekip/rol sayısı ${byTeam.size}. En sık bulgu: ${[...codes].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} (${n})`).join(" · ")}. Kaynak çoğunlukla rotasyon modeli ise model düzeltmesi kişi bazlı düzeltmeden önce gelir.`, links: [{ label: "Emniyet ve yorgunluk", href: "/analiz/emniyet" }, { label: "Ekip rotasyonu", href: "/planlama/rotasyon" }] });
  } else for (const p of restP) {
    const v = p.violations.filter((x) => x.severity === "ERROR");
    out.push({ code: "REST", severity: "CRITICAL", area: "EMNİYET", title: `Dinlenme uygunluk sorunu — ${p.person.name}`, detail: `${v.length} ihlal penceresi; ilki: ${v[0].message}`, links: [{ label: "Personel analizi", href: `/analiz/personel/${p.person.id}` }, { label: "Planlama", href: "/planlama" }] });
  }
  // Yoğunlaşma (aynı rol, görevli olanlar arasında)
  const byRole = new Map<string, PersonStats[]>();
  for (const p of ps.filter((x) => x.available && x.actual > 0)) byRole.set(p.person.crewRole ?? "-", [...(byRole.get(p.person.crewRole ?? "-") ?? []), p]);
  for (const [role, xs] of byRole) {
    if (xs.length < 3) continue;
    const avg = xs.reduce((s, x) => s + x.actual, 0) / xs.length;
    for (const x of xs.filter((x) => x.actual > avg * cfg.concentrationRatio)) out.push({ code: "LOAD", severity: "WARNING", area: "İŞ YÜKÜ", title: `İş yükü yoğunlaşması — ${x.person.name}`, detail: `${(x.actual / H).toFixed(1)} sa; ${role} ortalaması ${(avg / H).toFixed(1)} sa. Görev yeterliği, izin ve araç uygunluğu kayıtlarını inceleyiniz.`, links: [{ label: "Personel analizi", href: `/analiz/personel/${x.person.id}` }] });
  }
  // Gece yoğunlaşması — ekip bazında tek uyarı
  const avail = ps.filter((x) => x.available && x.actual > 0);
  const heavy = avail.filter((x) => x.night / x.actual > cfg.nightShareMax);
  if (heavy.length && heavy.length <= Math.ceil(avail.length / 2)) {
    const teams = [...new Set(heavy.map((x) => x.person.teamKey ?? x.person.name.replace("ÖRNEK ", "")))];
    out.push({ code: "NIGHT", severity: "INFO", area: "İŞ YÜKÜ", title: `Gece çalışması ${teams.length} ekip/kişide yoğun (${heavy.length} kişi)`, detail: `${teams.slice(0, 8).join(", ")}${teams.length > 8 ? "…" : ""} — çalışmalarının %${Math.round(cfg.nightShareMax * 100)}'inden fazlası gece. Rotasyonda gece görevinin römorkörler arasında döndürülmesi seçeneğini değerlendiriniz.`, links: [{ label: "Ekip rotasyonu", href: "/planlama/rotasyon" }, { label: "İş yükü dengesi", href: "/analiz/is-yuku" }] });
  }
  for (const p of ps.filter((x) => x.overtime / H / weeks > cfg.overtimeHoursPerWeek)) out.push({ code: "OT", severity: "WARNING", area: "İŞ YÜKÜ", title: `Artan fazla mesai — ${p.person.name}`, detail: `Haftalık ortalama ${(p.overtime / H / weeks).toFixed(1)} sa fazla mesai. Nedenler: ${[...p.overtimeReasons.slice(0, 2), ...(p.outsideShift > 0 ? [`vardiya dışı görev katılımı ${(p.outsideShift / H).toFixed(1)} sa (hazır bulunmadan çağrılma)`] : [])].join("; ") || "kayıtlı neden yok"}.`, links: [{ label: "Personel analizi", href: `/analiz/personel/${p.person.id}` }] });
  // Römorkör dengesi (aynı gruptaki ve kullanılabilir olanlar arasında)
  for (const mode of ["DAY", "NIGHT"] as const) {
    const xs = as.filter((a) => a.asset.type === "TUG" && a.asset.mode === mode && a.utilization != null && a.available > 24 * H);
    if (xs.length < 2) continue;
    const hi = xs.reduce((m, x) => (x.utilization! > m.utilization! ? x : m)), lo = xs.reduce((m, x) => (x.utilization! < m.utilization! ? x : m));
    if (hi.utilization! - lo.utilization! > cfg.tugImbalanceRatio * hi.utilization!) out.push({ code: "TUG_BAL", severity: "INFO", area: "FİLO", title: `Dengesiz römorkör kullanımı (${mode === "DAY" ? "gündüz" : "gece"} grubu)`, detail: `${hi.asset.code} %${Math.round(hi.utilization! * 100)} · ${lo.asset.code} %${Math.round(lo.utilization! * 100)}. Düşük kullanım yedek kapasite tutulmasından kaynaklanabilir; tek başına performans göstergesi değildir.`, links: [{ label: "Römorkör analizi", href: "/analiz/romorkor" }] });
  }
  // Bekleme
  for (const o of sc.ops) {
    const w = sc.times.get(o.id)!.waiting;
    const m = w.reduce((s, x) => s + (x.iv[1] - x.iv[0]), 0) / 60_000;
    if (m > cfg.waitMinutes) out.push({ code: "WAIT", severity: "INFO", area: "İŞ YÜKÜ", title: `Olağan dışı bekleme — ${o.ref}`, detail: `${Math.round(m)} dk bekleme. Kayıtlı neden: ${w.map((x) => x.note ?? x.reason).join("; ")}`, links: [{ label: o.ref, href: `/operasyonlar/${o.ref}` }] });
  }
  // Finans
  const unbilled = sc.ops.filter((o) => { const x = opFinance(ds, o.id); const t = sc.times.get(o.id)!; return x.accrual && !x.invoiceIds.length && t.completed && ds.asOf - t.serviceDate > cfg.unbilledDays * DAY; });
  if (unbilled.length) out.push({ code: "UNBILLED", severity: "WARNING", area: "FİNANS", title: `${unbilled.length} tamamlanmış iş ${cfg.unbilledDays} günden uzun süredir faturalanmamış`, detail: unbilled.slice(0, 6).map((o) => o.ref).join(", ") + (unbilled.length > 6 ? "…" : ""), links: [{ label: "Fatura ve tahakkuk", href: "/analiz/finans?muhasebe=AWAITING_EXPORT&durum=COMPLETED" }] });
  const fs = financeSummary({ ...sc, f: { ...f, basis: "SERVICE" } });
  for (const d of fs.invoiceDiff.filter((d) => Math.abs(d.net - d.accrual) / Math.max(1, Math.abs(d.accrual)) * 100 > cfg.invoiceDiffPct)) out.push({ code: "INV_DIFF", severity: "WARNING", area: "FİNANS", title: `Fatura–tahakkuk farkı — ${d.ref}`, detail: `Tahakkuk ${(d.accrual / 100).toLocaleString("tr-TR")} TL · fatura ${(d.net / 100).toLocaleString("tr-TR")} TL`, links: [{ label: d.ref, href: `/operasyonlar/${d.ref}` }] });
  // Yakıt sapması: ölçülen tüketim / motor saati, filo ortalamasından sapma
  const rates = as.filter((a) => a.engineHours && a.fuelMeasured > 0).map((a) => ({ a, r: a.fuelMeasured / a.engineHours! }));
  if (rates.length >= 2) { const avg = rates.reduce((s, x) => s + x.r, 0) / rates.length; for (const x of rates.filter((x) => Math.abs(x.r - avg) / avg * 100 > cfg.fuelDeviationPct)) out.push({ code: "FUEL", severity: "INFO", area: "FİLO", title: `Yakıt sapması — ${x.a.asset.code}`, detail: `${x.r.toFixed(0)} L/motor saati; ölçülen filo ortalaması ${avg.toFixed(0)} L/sa`, links: [{ label: "Römorkör analizi", href: `/analiz/romorkor/${x.a.asset.id}` }] }); }
  // Veri
  const missing = ps.reduce((s, p) => s + p.missing.length, 0);
  if (missing) out.push({ code: "MISSING", severity: "WARNING", area: "VERİ", title: `${missing} vardiyada gerçekleşen zaman kaydı eksik`, detail: "Eksik kayıt sıfır kabul edilmez; toplamlar bu vardiyaları içermez.", links: [{ label: "Veri kalitesi", href: "/analiz/emniyet#kalite" }] });
  const lastAcc = ds.lastUpdates.accounting;
  if (!lastAcc || ds.asOf - lastAcc > cfg.accountingStaleDays * DAY) out.push({ code: "STALE", severity: "WARNING", area: "VERİ", title: "Muhasebe verisi güncel değil", detail: lastAcc ? `Son fatura/tahsilat aktarımı ${trDay(lastAcc)} — ${Math.floor((ds.asOf - lastAcc) / DAY)} gün önce` : "Muhasebe aktarımı yok", links: [{ label: "Fatura ve tahakkuk", href: "/analiz/finans" }] });
  const order: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export interface Quality { lastUpdates: Record<string, number | null>; sources: string[]; missingRecords: number; pendingHours: number; financialMatchRate: number | null; paymentMatchRate: number | null; estimateShare: number | null; manualCorrections: number; overlaps: number; demoShare: number }
export function quality(sc: Scope, ps: PersonStats[]): Quality {
  const { ds } = sc;
  const done = sc.ops.filter((o) => sc.times.get(o.id)!.completed && o.accrualStatus === "APPROVED");
  const matched = done.filter((o) => opFinance(ds, o.id).invoiceIds.length).length;
  const pays = ds.payments.filter((p) => sc.inRange(dayStart(p.date) + 12 * H));
  const paid = pays.reduce((s, p) => s + p.cents, 0), m = pays.reduce((s, p) => s + p.matches.reduce((a, x) => a + x.cents, 0), 0);
  const costs = ds.costs.filter((c) => sc.inRange(dayStart(c.day) + 12 * H));
  const ct = costs.reduce((s, c) => s + c.cents, 0), ce = costs.filter((c) => c.nature === "ESTIMATE").reduce((s, c) => s + c.cents, 0);
  return {
    lastUpdates: ds.lastUpdates, sources: ["Zaman çizelgesi olayları", "Vardiya ve gerçekleşen kayıtları", "Fiilî katılım kayıtları", "Hesap sonuçları (tahakkuk)", "Fatura/tahsilat (muhasebe aktarımı)", "Maliyet kayıtları", "Motor saati/yakıt"],
    missingRecords: ps.reduce((s, p) => s + p.missing.length, 0), pendingHours: ps.reduce((s, p) => s + p.pendingApproval, 0) / H,
    financialMatchRate: done.length ? matched / done.length : null, paymentMatchRate: paid ? m / paid : null, estimateShare: ct ? ce / ct : null,
    manualCorrections: ps.reduce((s, p) => s + p.corrections.length, 0), overlaps: ps.reduce((s, p) => s + p.overlaps, 0), demoShare: sc.ops.length ? 1 : 0,
  };
}

/** İş yükü dengesi: rol grubunda kişilerin gerçekleşen saati; izinli / göreve çıkmayanlar karşılaştırmaya alınmaz */
export function balance(ps: PersonStats[]) {
  const groups = new Map<string, PersonStats[]>();
  for (const p of ps) groups.set(p.person.crewRole ?? "-", [...(groups.get(p.person.crewRole ?? "-") ?? []), p]);
  return [...groups].map(([role, xs]) => {
    const cmp = xs.filter((x) => x.available && x.actual > 0);
    const vals = cmp.map((x) => x.actual / H);
    const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    const sd = vals.length ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) : 0;
    return { role, compared: cmp.length, excluded: xs.length - cmp.length, mean, sd, cv: mean ? sd / mean : 0, nightMean: cmp.length ? cmp.reduce((s, x) => s + x.night / H, 0) / cmp.length : 0 };
  });
}

/** Otomatik değerlendirme — gözlem + incelenecek kaynaklar; kesin hüküm ve personel kararı içermez */
export function narrative(alerts: Alert[], ps: PersonStats[], as: AssetStats[]): string[] {
  const out: string[] = [];
  const night = alerts.find((a) => a.code === "NIGHT");
  if (night) out.push(`Bu dönemde gece görevleri belirli ekiplerde yoğunlaşmış görünüyor (${night.detail.split(" — ")[0]}). Dağılımı etkileyen rotasyon, yeterlik, izin ve araç uygunluğu kayıtlarını inceleyiniz.`);
  const rest = ps.filter((p) => p.violations.some((v) => v.severity === "ERROR")).length;
  if (rest) out.push(`${rest} kişide dinlenme kuralı ihlali kaydı var. Bu bir uyarıdır; nedenleri (acil görev, plan değişikliği, rotasyon modeli) vardiya ve istisna kayıtlarından doğrulanmalıdır.`);
  const tb = alerts.find((a) => a.code === "TUG_BAL");
  if (tb) out.push(`Römorkörler arasında kullanım farkı gözleniyor (${tb.detail.split(".")[0]}). Bakım/arıza, yedek tutulma ve görevlendirme kurallarını birlikte değerlendiriniz.`);
  const ub = alerts.find((a) => a.code === "UNBILLED");
  if (ub) out.push(`${ub.title}. Tahakkuk onayı ve fatura muhatabı onayı adımlarını kontrol ediniz.`);
  const downs = as.filter((a) => a.downTotal > 0);
  if (downs.length) out.push(`${downs.map((a) => `${a.asset.code} ${Math.round(a.downTotal / H)} sa`).join(", ")} bakım/arıza nedeniyle kullanılamadı; bu süreler kullanım oranı paydasından düşülmüştür.`);
  if (!out.length) out.push("Seçili dönem ve filtrelerde belirgin bir yoğunlaşma veya sapma gözlenmedi.");
  return out;
}
