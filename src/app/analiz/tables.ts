/**
 * Analiz tabloları — ekran ve Excel çıktısı AYNI tanımdan üretilir (toplamlar mutabık kalır).
 * Para kolonları TL (kuruştan çevrilmiş), süreler saat.
 */
import type { Col, Sheet } from "@/lib/excel";
import { H, MIN, total } from "@/lib/analytics/core";
import { allocateRevenue, linesInScope, relatedNet, opFinance, financeSummary, results, planActual, DEV_LABEL, COST_LABEL, NATURE_LABEL, type PersonStats, type AssetStats, type Scope } from "@/lib/analytics/model";
import type { AnalyticsAccess } from "@/lib/analytics/access";

const h = (ms: number) => Math.round((ms / H) * 10) / 10;
const lira = (c: number) => Math.round(c) / 100;
const ROLE: Record<string, string> = { KAPTAN: "Römorkör kaptanı", BASCARKCI: "Başçarkçı", YAGCI: "Yağcı", PIMCI: "Pimci", KILAVUZ: "Kılavuz kaptan", KIYI_OPS: "Kıyı operasyon" };
const ST: Record<string, string> = { COMPLETED: "Tamamlandı", PARTIAL: "Kısmen", CANCELLED: "İptal", READY: "Planlı", STARTED: "Başladı" };
const clean = (s: string) => s.replace("ÖRNEK ", "");

export function personSheet(sc: Scope, ps: PersonStats[], acc: AnalyticsAccess): Sheet & { links: Record<string, string> } {
  const allocP = acc.finance ? allocateRevenue(sc.ds, linesInScope(sc), "PERSONNEL") : null;
  const allocBy = new Map<string, number>(); for (const r of allocP?.rows ?? []) allocBy.set(r.targetId, (allocBy.get(r.targetId) ?? 0) + r.cents);
  const columns: Col[] = [
    { key: "name", header: "Personel", type: "text" }, { key: "role", header: "Görev", type: "text" }, { key: "team", header: "Ekip", type: "text" },
    { key: "planned", header: "Planlanan (sa)", type: "hours", total: true }, { key: "actual", header: "Gerçekleşen (sa)", type: "hours", total: true },
    { key: "normal", header: "Normal mesai (sa)", type: "hours", total: true }, { key: "overtime", header: "Fazla mesai (sa)", type: "hours", total: true }, { key: "otApproved", header: "Onaylı fazla mesai (sa)", type: "hours", total: true },
    { key: "night", header: "Gece (sa)", type: "hours", total: true }, { key: "standby", header: "Hazır bulunma (sa)", type: "hours", total: true },
    { key: "active", header: "Aktif hizmet (sa)", type: "hours", total: true }, { key: "transit", header: "İntikal (sa)", type: "hours", total: true }, { key: "waiting", header: "Bekleme (sa)", type: "hours", total: true },
    { key: "ops", header: "Görev (iş)", type: "int", total: true }, { key: "shifts", header: "Vardiya", type: "int", total: true }, { key: "diff", header: "Plan farkı (sa)", type: "hours", total: true },
    { key: "pending", header: "Onay bekleyen (sa)", type: "hours", total: true }, { key: "missing", header: "Eksik kayıt", type: "int", total: true }, { key: "viol", header: "Dinlenme ihlali", type: "int", total: true },
    { key: "minRest24", header: "En düşük 24s dinlenme (sa)", type: "hours" }, { key: "leave", header: "İzin (gün)", type: "number" },
    ...(acc.finance ? [
      { key: "related", header: "Katıldığı işlerin net faturası (TL)", type: "money", note: "Ticari büyüklük — kişiler arasında toplanamaz" } as Col,
      { key: "allocated", header: "Dağıtılmış analitik gelir (TL)", type: "money", total: true, note: "Ücret, prim veya muhasebe geliri değildir" } as Col,
    ] : []),
  ];
  const links: Record<string, string> = {};
  const rows = ps.map((p) => {
    links[p.person.id] = `/analiz/personel/${p.person.id}`;
    return {
      _id: p.person.id, name: clean(p.person.name), role: ROLE[p.person.crewRole ?? ""] ?? p.person.crewRole ?? "", team: p.person.teamKey ?? "",
      planned: h(p.planned), actual: h(p.actual), normal: h(p.normal), overtime: h(p.overtime), otApproved: h(p.overtimeApproved), night: h(p.night), standby: h(p.standby),
      active: h(p.active), transit: h(p.transit), waiting: h(p.waiting), ops: p.ops.length, shifts: p.shiftCount, diff: h(p.actual - p.planned), pending: h(p.pendingApproval), missing: p.missing.length,
      viol: p.violations.filter((v) => v.severity === "ERROR").length, minRest24: p.minRest24h == null ? null : Math.round(p.minRest24h / 6) / 10, leave: p.leaveDays,
      related: acc.finance ? lira(relatedNet(sc.ds, p.ops)) : undefined, allocated: acc.finance ? lira(allocBy.get(p.person.id) ?? 0) : undefined,
      _flag: !p.available ? "görevsiz/izinli" : "",
    };
  });
  return { name: "Personel", columns, rows, links, caption: acc.finance ? `Gelir dağıtımı: ${allocP!.methodNote}. "Katıldığı işlerin net faturası" kişiler arasında toplanamaz.` : undefined };
}

export function assetSheet(sc: Scope, as: AssetStats[], acc: AnalyticsAccess): Sheet & { links: Record<string, string> } {
  const allocA = acc.finance ? allocateRevenue(sc.ds, linesInScope(sc), "ASSET") : null;
  const allocBy = new Map<string, number>(); for (const r of allocA?.rows ?? []) allocBy.set(r.targetId, (allocBy.get(r.targetId) ?? 0) + r.cents);
  const costBy = new Map<string, number>();
  if (acc.costs) for (const c of sc.ds.costs) if (c.assetId && sc.inRange(new Date(`${c.day}T12:00:00+03:00`).getTime())) costBy.set(c.assetId, (costBy.get(c.assetId) ?? 0) + c.cents);
  const columns: Col[] = [
    { key: "code", header: "Kod", type: "id" }, { key: "name", header: "Araç", type: "text" }, { key: "group", header: "Karşılaştırma grubu", type: "text" },
    { key: "plannedAv", header: "Planlanan kullanılabilir (sa)", type: "hours", total: true }, { key: "available", header: "Gerçek kullanılabilir (sa)", type: "hours", total: true },
    { key: "active", header: "Aktif hizmet (sa)", type: "hours", total: true }, { key: "transit", header: "İntikal (sa)", type: "hours", total: true }, { key: "waiting", header: "Bekleme (sa)", type: "hours", total: true },
    { key: "standby", header: "Hazır bulunma (sa)", type: "hours", total: true }, { key: "down", header: "Bakım/arıza (sa)", type: "hours", total: true },
    { key: "ops", header: "Görev (iş)", type: "int", total: true }, { key: "day", header: "Gündüz katılım (sa)", type: "hours", total: true }, { key: "night", header: "Gece katılım (sa)", type: "hours", total: true },
    { key: "util", header: "Kullanım oranı", type: "pct" }, { key: "engine", header: "Motor saati (sayaç)", type: "hours", total: true, note: "Operasyon saati veya ücretlendirilen saatle aynı ölçüm değildir" },
    { key: "fuelM", header: "Yakıt ölçülen (L)", type: "int", total: true }, { key: "fuelE", header: "Yakıt tahmini (L)", type: "int", total: true },
    ...(acc.finance ? [{ key: "related", header: "Katıldığı işlerin net faturası (TL)", type: "money", note: "Araçlar arasında toplanamaz" } as Col, { key: "allocated", header: "Dağıtılmış analitik gelir (TL)", type: "money", total: true } as Col] : []),
    ...(acc.costs ? [{ key: "cost", header: "Doğrudan araç maliyeti (TL)", type: "money", total: true, note: "Yakıt + bakım (araca kayıtlı); personel ve genel gider hariç" } as Col] : []),
  ];
  const links: Record<string, string> = {};
  const rows = as.map((a) => {
    links[a.asset.id] = `/analiz/romorkor/${a.asset.id}`;
    return {
      _id: a.asset.id, code: a.asset.code ?? "", name: a.asset.name, group: a.asset.type === "TUG" ? `Römorkör · ${a.asset.mode === "NIGHT" ? "gece" : "gündüz"}${a.asset.bollardPullT ? ` · ${a.asset.bollardPullT} t` : " · çeki gücü doğrulanmadı"}` : ({ PILOT_BOAT: "Kılavuz botu", MOORING_BOAT: "Palamar botu", SURFACE_CLEANING_VESSEL: "Temizlik teknesi" } as Record<string, string>)[a.asset.type] ?? a.asset.type,
      plannedAv: h(a.plannedAvailable), available: h(a.available), active: h(a.active), transit: h(a.transit), waiting: h(a.waiting), standby: h(a.standby), down: h(a.downTotal), ops: a.ops.length,
      day: h(a.day), night: h(a.night), util: a.utilization, engine: a.engineHours, fuelM: Math.round(a.fuelMeasured), fuelE: Math.round(a.fuelEstimated),
      related: acc.finance ? lira(relatedNet(sc.ds, a.ops)) : undefined, allocated: acc.finance ? lira(allocBy.get(a.asset.id) ?? 0) : undefined, cost: acc.costs ? lira(costBy.get(a.asset.id) ?? 0) : undefined,
    };
  });
  return { name: "Araçlar", columns, rows, links, caption: allocA ? `Gelir dağıtımı: ${allocA.methodNote}. Dağıtılamayan: ${(allocA.unallocated.reduce((s, u) => s + u.cents, 0) / 100).toLocaleString("tr-TR")} TL (kılavuzluk vb.)` : undefined };
}

export function opSheet(sc: Scope, acc: AnalyticsAccess): Sheet & { links: Record<string, string> } {
  const links: Record<string, string> = {};
  const columns: Col[] = [
    { key: "ref", header: "İş emri", type: "id" }, { key: "date", header: "Hizmet tarihi", type: "datetime" }, { key: "type", header: "Tür", type: "text" }, { key: "vessel", header: "Gemi", type: "text" },
    { key: "party", header: "Fatura muhatabı", type: "text" }, { key: "status", header: "Durum", type: "text" }, { key: "prio", header: "Nitelik", type: "text" }, { key: "night", header: "Gece", type: "text" },
    { key: "active", header: "Aktif hizmet (sa)", type: "hours", total: true }, { key: "transit", header: "İntikal (sa)", type: "hours", total: true }, { key: "waiting", header: "Bekleme (sa)", type: "hours", total: true },
    ...(acc.finance ? ([
      { key: "estimate", header: "Tahmini (TL)", type: "money", total: true }, { key: "accrual", header: "Onaylı tahakkuk (TL)", type: "money", total: true }, { key: "invoiced", header: "Fatura (TL)", type: "money", total: true },
      { key: "credit", header: "İade/düzeltme (TL)", type: "money", total: true }, { key: "net", header: "Net fatura (TL)", type: "money", total: true }, { key: "tax", header: "Vergi (TL)", type: "money", total: true },
      { key: "collected", header: "Tahsilat (TL)", type: "money", total: true }, { key: "open", header: "Açık alacak (TL)", type: "money", total: true }, { key: "disputed", header: "İtirazlı (TL)", type: "money", total: true },
    ] as Col[]) : []),
  ];
  const rows = sc.ops.map((o) => {
    const t = sc.times.get(o.id)!; links[o.ref] = `/operasyonlar/${o.ref}`;
    const x = acc.finance ? opFinance(sc.ds, o.id) : null;
    return {
      _id: o.ref, ref: o.ref, date: t.serviceDate, type: o.typeName, vessel: clean(o.vesselName), party: clean(sc.ds.parties[o.billingPartyId ?? ""] ?? "—"), status: ST[o.opStatus] ?? o.opStatus,
      prio: { NORMAL: "Normal", MANDATORY: "Zorunlu", EMERGENCY: "Acil" }[o.priority] ?? o.priority, night: t.night ? "Gece" : "Gündüz",
      active: h(total(t.service) - t.waiting.reduce((s, w) => s + (w.iv[1] - w.iv[0]), 0)), transit: h(total(t.transit)), waiting: h(t.waiting.reduce((s, w) => s + (w.iv[1] - w.iv[0]), 0)),
      ...(x ? { estimate: x.estimate == null ? null : lira(x.estimate), accrual: x.accrualApproved ? lira(x.accrual ?? 0) : null, invoiced: lira(x.invoiced), credit: lira(x.credit), net: lira(x.net), tax: lira(x.tax), collected: lira(x.collected), open: lira(x.open), disputed: lira(x.disputed) } : {}),
    };
  }).sort((a, b) => (a.date as number) - (b.date as number));
  return { name: "İş emirleri", columns, rows, links };
}

export function resultSheet(sc: Scope, by: "customer" | "type" | "night"): Sheet {
  const rs = results(sc, (o) => by === "customer" ? { key: o.billingPartyId ?? "-", label: clean(sc.ds.parties[o.billingPartyId ?? ""] ?? "—") } : by === "type" ? { key: o.typeCode, label: `${o.typeCode} · ${o.typeName}` } : { key: sc.times.get(o.id)!.night ? "N" : "D", label: sc.times.get(o.id)!.night ? "Gece vardiyası" : "Gündüz vardiyası" });
  const columns: Col[] = [
    { key: "label", header: by === "customer" ? "Müşteri" : by === "type" ? "Operasyon türü" : "Vardiya", type: "text" },
    { key: "revenue", header: "Gelir — net fatura (TL)", type: "money", total: true }, { key: "direct", header: "Doğrudan maliyet (TL)", type: "money", total: true },
    { key: "contribution", header: "Katkı (TL)", type: "money", total: true }, { key: "allocated", header: "Dağıtılmış gider (TL)", type: "money", total: true },
    { key: "result", header: rs.complete ? "Analitik sonuç (TL)" : "Analitik sonuç — eksik/tahmini maliyet (TL)", type: "money", total: true }, { key: "est", header: "Tahmini maliyet payı", type: "pct" },
  ];
  return { name: by === "customer" ? "Sonuç-müşteri" : by === "type" ? "Sonuç-tür" : "Sonuç-vardiya", columns, rows: rs.rows.map((r) => ({ label: r.label, revenue: lira(r.revenue), direct: lira(r.direct), contribution: lira(r.contribution), allocated: lira(r.allocated), result: lira(r.result), est: r.estimateShare })), caption: `${rs.label}. ${rs.scopeNote} Operasyona bağlanamayan maliyet: ${(rs.unassignedCost / 100).toLocaleString("tr-TR")} TL.` };
}

export function costSheet(sc: Scope): Sheet {
  const rows = sc.ds.costs.filter((c) => sc.inRange(new Date(`${c.day}T12:00:00+03:00`).getTime()) && (c.category !== "PERSONNEL" && c.category !== "OVERTIME")).map((c) => ({ day: c.day, cat: COST_LABEL[c.category] ?? c.category, nature: NATURE_LABEL[c.nature], amount: lira(c.cents), asset: sc.ds.assets.find((a) => a.id === c.assetId)?.code ?? "", op: sc.ds.ops.find((o) => o.id === c.opId)?.ref ?? "", desc: c.description ?? "", basis: c.allocationBasis ?? "" }));
  return { name: "Maliyet kayıtları", columns: [{ key: "day", header: "Gün", type: "text" }, { key: "cat", header: "Kategori", type: "text" }, { key: "nature", header: "Nitelik", type: "text" }, { key: "amount", header: "Tutar (TL)", type: "money", total: true }, { key: "asset", header: "Araç", type: "id" }, { key: "op", header: "İş emri", type: "id" }, { key: "desc", header: "Açıklama", type: "text" }, { key: "basis", header: "Dağıtım esası", type: "text" }], rows, groupBy: "cat", caption: "Personel/bordro kayıtları bu listede yer almaz (hassas veri; yalnız yetkili toplam olarak sonuç tablolarına girer)." };
}

export function planSheet(sc: Scope, acc: AnalyticsAccess): Sheet & { links: Record<string, string> } {
  const links: Record<string, string> = {};
  const rows = planActual(sc).map((r) => {
    links[r.op.ref] = `/operasyonlar/${r.op.ref}`;
    return {
      _id: r.op.ref, ref: r.op.ref, type: r.op.typeName, plannedStart: r.plannedStart, actualStart: r.actualStart, delay: r.startDelay == null ? null : Math.round(r.startDelay / MIN),
      plannedDur: r.plannedDur == null ? null : Math.round(r.plannedDur / MIN), actualDur: r.actualDur == null ? null : Math.round(r.actualDur / MIN), pt: r.plannedTugs, at: r.actualTugs,
      estimate: acc.finance && r.estimate != null ? lira(r.estimate) : null, final: acc.finance && r.final != null ? lira(r.final) : null,
      reasons: r.reasons.map((d) => `${DEV_LABEL[d.category] ?? d.category}${d.minutes ? ` (${d.minutes} dk)` : ""}: ${d.note ?? ""}`).join(" | "), resp: r.reasons.map((d) => d.responsibility).filter(Boolean).join(" | "),
    };
  });
  const columns: Col[] = [
    { key: "ref", header: "İş emri", type: "id" }, { key: "type", header: "Tür", type: "text" }, { key: "plannedStart", header: "Planlanan başlangıç", type: "datetime" }, { key: "actualStart", header: "Gerçek başlangıç", type: "datetime" },
    { key: "delay", header: "Başlangıç sapması (dk)", type: "int" }, { key: "plannedDur", header: "Tahmini süre (dk)", type: "int", total: true }, { key: "actualDur", header: "Gerçek süre (dk)", type: "int", total: true },
    { key: "pt", header: "Planlanan römorkör", type: "int", total: true }, { key: "at", header: "Gerçek römorkör", type: "int", total: true },
    ...(acc.finance ? [{ key: "estimate", header: "Tahmini tutar (TL)", type: "money", total: true } as Col, { key: "final", header: "Nihai tahakkuk (TL)", type: "money", total: true } as Col] : []),
    { key: "reasons", header: "Sapma nedenleri", type: "text", width: 60 }, { key: "resp", header: "Sorumluluk kaydı (ayrı)", type: "text", width: 40 },
  ];
  return { name: "Plan-gerçekleşen", columns, rows, links, caption: "Sistem sapmanın görüldüğü kişi veya aracı otomatik sorumlu ilan etmez; neden ve sorumluluk kayıtları ayrı tutulur." };
}

export function financeMeta(sc: Scope) {
  const fs = financeSummary(sc);
  return [
    ["Tahmini teklif", fs.estimate], ["Onaylı tahakkuk", fs.accrual], ["Faturalanmamış tahakkuk", fs.unbilledAccrual], ["Düzenlenmiş fatura", fs.invoiced], ["İptal/iade/düzeltme etkisi", fs.credit],
    ["Net fatura (vergi hariç)", fs.net], ["Vergi", fs.tax], ["Tahsilat (eşleşmiş, vergi dahil)", fs.collected], ["Açık alacak (vergi dahil)", fs.open], ["İtirazlı tutar", fs.disputed], ["Faturayla eşleşmeyen tahsilat", fs.unmatchedPayments],
  ] as [string, number][];
}
