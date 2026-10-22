/** Belge şablonları: hepsi aynı operasyon kaydından üretilir; kritik alan elle yeniden girilmez. */
import type { DocSpec, DocSection } from "./render";
import type { CalcResult } from "../tariff/types";
import { DECL_FIELDS, type Declaration } from "../declaration";
import { INVOICE_NOTE } from "@/data/catalog";
const tl = (v: string) => `${Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

export const DOC_TYPES = {
  TALEPNAME: "Talepname",
  BEYAN_FORMU: "Beyan formu",
  TAAHHUTNAME: "Taahhütname",
  IS_EMRI: "İş emri",
  BILL: "Bill / hizmet pusulası",
  IS_BITIM_RAPORU: "İş bitim raporu",
  HESAP_DOKUMU: "Hesaplama dökümü",
} as const;
export type DocType = keyof typeof DOC_TYPES;

/** Fatura muhatabı onayının bağlandığı belge türleri: içerik değişirse yeni onay gerekir */
export const APPROVAL_BOUND: DocType[] = ["TALEPNAME", "TAAHHUTNAME"];

export interface DocInput {
  opRef: string; portCallRef: string; isDemo: boolean;
  typeCode: string; typeName: string;
  plannedStart: string | null; from: string | null; to: string | null;
  vessel: { name: string; imo: string | null; flag: string | null; type: string | null; gt: string | null; nt: string | null; dwt: string | null; loa: string | null };
  requester: string | null; agent: string | null;
  billing: { name: string; taxNumber: string | null; taxOffice: string | null; address: string | null } | null;
  billingDecision: string | null;
  declarations: { version: number; layer: string; payload: Declaration; createdAt: string }[];
  lines: { kind: string; allocated: number | null; billable: number | null; status: string; cancelReason: string | null }[];
  durations: { kind: string; start: string | null; end: string | null; minutes: number | null; pause: number }[];
  events: { at: string; label: string; asset: string | null; note: string | null }[];
  calcs: CalcResult[];
  estimates: CalcResult[];
  statuses: Record<string, string>;
}

const SVC: Record<string, string> = { PILOTAGE: "Kılavuzluk", TOWAGE: "Römorkörcülük", MOORING: "Palamar bağlama", UNMOORING: "Palamar çözme", LINE_HANDLING: "Halat", CHARTER: "Kiralama", SALVAGE_REVIEW: "Kurtarma değ.", SPECIAL: "Özel hizmet" };
const LAYER: Record<string, string> = { CUSTOMER_DECLARED: "Müşteri beyanı", FIELD_VERIFIED: "Saha doğrulaması", APPROVED_FINAL: "Onaylı son durum" };
const v = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : String(x));
const OPS: Record<string, string> = { READY: "Sevke hazır", TRANSIT: "İntikalde", ON_SITE: "Sahada", STARTED: "Başladı", PAUSED: "Durakladı", COMPLETED: "Tamamlandı", PARTIAL: "Kısmen tamamlandı", CANCELLED: "İptal" };
const IN_LABEL: Record<string, string> = { gt: "GT", measuredMinutes: "Gerçek süre (dk)", allocatedUnits: "Tahsis", requestedUnits: "Ücretlenebilir", conditionCodes: "Koşullar", completion: "Tamamlanma", serviceDate: "Hizmet tarihi" };
const inputs = (o: Record<string, unknown>) => Object.entries(o).map(([k, x]) => `${IN_LABEL[k] ?? k}: ${Array.isArray(x) ? (x.length ? x.join(", ") : "—") : x === null ? "—" : k === "measuredMinutes" ? Number(x).toFixed(1) : String(x)}`).join("\n");
const mins = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`);

function opSection(d: DocInput): DocSection {
  return { heading: "Operasyon", kv: [
    ["Operasyon kimliği", d.opRef], ["Liman uğrağı", d.portCallRef], ["Operasyon türü", `${d.typeCode} — ${d.typeName}`],
    ["Başlangıç → hedef", `${v(d.from)} → ${v(d.to)}`], ["İstenen / planlanan zaman", v(d.plannedStart)],
  ] };
}
function vesselSection(d: DocInput): DocSection {
  return { heading: "Gemi", kv: [
    ["Gemi adı", d.vessel.name], ["IMO", v(d.vessel.imo)], ["Bayrak / tip", `${v(d.vessel.flag)} / ${v(d.vessel.type)}`],
    ["GT / NT / DWT (kayıt)", `${v(d.vessel.gt)} / ${v(d.vessel.nt)} / ${v(d.vessel.dwt)}`], ["Tam boy (LOA)", d.vessel.loa ? `${d.vessel.loa} m` : "—"],
  ] };
}
function partiesSection(d: DocInput): DocSection {
  return { heading: "Taraflar", kv: [
    ["Talep eden", v(d.requester)], ["Acente", v(d.agent)],
    ["Fatura muhatabı", d.billing ? `${d.billing.name}${d.billing.taxNumber ? ` · VKN ${d.billing.taxNumber}` : ""}` : "Belirlenmedi"],
    ["Muhatap onayı", d.billingDecision === "APPROVED" ? "Onaylandı" : d.billingDecision === "REJECTED" ? "Reddedildi" : "Bekliyor"],
  ] };
}
function declSection(d: DocInput, layers: string[]): DocSection {
  const list = d.declarations.filter((x) => layers.includes(x.layer));
  const cols = ["Alan", ...list.map((x) => `v${x.version} ${LAYER[x.layer]}`)];
  const rows = DECL_FIELDS.map((f) => [f.label, ...list.map((x) => v(x.payload[f.key]))]).filter((r) => r.slice(1).some((c) => c !== "—"));
  return { heading: "Beyan", table: { cols, widths: [2, ...list.map(() => 2)], rows } };
}
function servicesSection(d: DocInput, withActual: boolean): DocSection {
  return withActual
    ? { heading: "Hizmetler ve gerçekleşen süreler", table: { cols: ["Hizmet", "Tahsis", "Ücretlenebilir", "Başlangıç", "Bitiş", "Gerçek süre", "Durum"], widths: [2.2, 1, 1.3, 1.6, 1.6, 1.5, 1.6],
      rows: d.lines.map((l) => { const du = d.durations.find((x) => x.kind === l.kind); return [SVC[l.kind] ?? l.kind, v(l.allocated), v(l.billable), v(du?.start), v(du?.end), mins(du?.minutes ?? null), OPS[l.status] ?? l.status]; }) } }
    : { heading: "Talep edilen hizmet bileşenleri", table: { cols: ["Hizmet", "Tahsis", "Not"], widths: [2, 1, 4], rows: d.lines.map((l) => [SVC[l.kind] ?? l.kind, v(l.allocated), "Kaynak ihtiyacı operasyon emniyet değerlendirmesiyle kesinleşir"]) } };
}

export function buildSpec(type: DocType, d: DocInput): DocSpec {
  const base = { docType: type, isDemo: d.isDemo, meta: [] as [string, string][], subtitle: "" };
  const est = d.estimates.filter((c) => !c.missing.length);
  const totalTL = est.length && est.every((c) => c.operational) ? est.reduce((s, c) => s + Number(c.operational!.amount), 0).toFixed(2) : null;
  const fxLine = est.find((c) => c.operational && c.currency !== "TRY")?.operational;
  switch (type) {
    case "TALEPNAME":
      return { ...base, title: "Talepname", subtitle: "Kılavuzluk, römorkörcülük ve palamar hizmeti talebi",
        sections: [opSection(d), vesselSection(d), declSection(d, ["CUSTOMER_DECLARED"]), servicesSection(d, false), partiesSection(d),
          { heading: "Beyan ve taahhüt", paragraph: "Talep eden, yukarıdaki gemi ve yük bilgilerinin doğru olduğunu beyan eder. Bu talep kaynak rezervasyonu veya operasyon izni anlamına gelmez; operasyon, emniyet değerlendirmesi ve yetkili onaylardan sonra planlanır. Beyana aykırılık halinde hizmet durdurulabilir veya yeniden fiyatlandırılabilir.", signatures: ["Talep eden", "Kaptan / acente"] }],
        footnotes: ["Talep eden taraf, ayrıca belirlenip onaylanmadıkça fatura muhatabı sayılmaz.", "Bilinmeyen değerler '—' olarak gösterilir; sıfır kabul edilmez.", INVOICE_NOTE] };
    case "BEYAN_FORMU":
      return { ...base, title: "Beyan formu", subtitle: "Müşteri beyanı ile saha doğrulamasının karşılaştırması",
        sections: [opSection(d), vesselSection(d), declSection(d, ["CUSTOMER_DECLARED", "FIELD_VERIFIED", "APPROVED_FINAL"]), { heading: "Kontrol", signatures: ["Kıyı operasyon sorumlusu", "Gemi kaptanı"] }] };
    case "TAAHHUTNAME":
      return { ...base, title: "Taahhütname", subtitle: "Fatura muhatabının ödeme ve kapsam taahhüdü",
        sections: [opSection(d), vesselSection(d), { heading: "Fatura muhatabı", kv: [["Unvan", v(d.billing?.name)], ["Vergi dairesi / no", `${v(d.billing?.taxOffice)} / ${v(d.billing?.taxNumber)}`], ["Adres", v(d.billing?.address)]] },
          { heading: "Tahmini bedel", table: { cols: ["Hizmet", "Kalem", "Liste tutarı", "TL karşılığı", "Durum"], widths: [2, 1.2, 1.6, 1.8, 1.4], rows: d.estimates.map((c) => [SVC[c.serviceKind], c.itemCode ? `[${c.itemCode}]` : "—", c.missing.length ? "—" : `${c.netAmount} ${c.currency}`, c.missing.length ? "—" : c.operational ? tl(c.operational.amount) : "Kur yok", c.productionEligible ? "Kesinleşebilir" : "Tahmini"]) } },
          { heading: "Fatura", paragraph: INVOICE_NOTE },
          { heading: "Taahhüt", paragraph: `Tahmin; doğrulanmış GT yoksa beyan edilen GT ile, saatlik hizmetlerde 1 saat varsayımıyla hesaplanmıştır. Fatura muhatabı, yukarıdaki operasyon kapsamında verilecek hizmet bedellerini, yürürlükteki tarife ve onaylı hesap dökümü esas alınarak ödemeyi taahhüt eder. Tahmini toplam: ${totalTL ? tl(totalTL) : "TL karşılığı hesaplanamadı (kur yok)"}${fxLine ? ` (döviz kalemler ${fxLine.rateSource}, ${fxLine.rateDate} kuru ${fxLine.rate} ile çevrildi)` : ""}. Nihai tutar gerçekleşen hizmet ve doğrulanmış parametrelerle belirlenir; kapsam değişikliği yeni onay gerektirir.`, signatures: ["Fatura muhatabı yetkilisi"] }] };
    case "IS_EMRI":
      return { ...base, title: "İş emri", subtitle: "Operasyon planı",
        sections: [opSection(d), vesselSection(d), servicesSection(d, false), partiesSection(d), { heading: "Onay", signatures: ["Planlamacı", "Operasyon yöneticisi"] }] };
    case "BILL":
      return { ...base, title: "Bill / hizmet pusulası", subtitle: "Verilen hizmetin gemi tarafınca teyidi",
        sections: [opSection(d), vesselSection(d), servicesSection(d, true), { heading: "Teyit", paragraph: "Yukarıdaki hizmetlerin belirtilen zamanlarda verildiği gemi kaptanınca teyit edilir. Zaman damgaları saha kayıtlarından alınmıştır ve yuvarlanmamıştır.", signatures: ["Gemi kaptanı", "Kılavuz kaptan", "Römorkör kaptanı"] }], footnotes: [INVOICE_NOTE] };
    case "IS_BITIM_RAPORU":
      return { ...base, title: "İş bitim raporu", subtitle: "Gerçekleşen operasyonun olay kaydı",
        sections: [opSection(d), vesselSection(d), servicesSection(d, true),
          { heading: "Olay zaman çizelgesi", table: { cols: ["Zaman", "Olay", "Araç", "Not"], widths: [1.6, 2.6, 1.4, 3], rows: d.events.map((e) => [e.at, e.label, v(e.asset), v(e.note)]) } },
          { heading: "Onay", signatures: ["Kıyı operasyon sorumlusu", "Operasyon yöneticisi"] }] };
    case "HESAP_DOKUMU":
      return { ...base, title: "Hesaplama dökümü", subtitle: "Bu bedel neden oluştu?",
        sections: [opSection(d), ...d.calcs.map((c) => ({
          heading: `${SVC[c.serviceKind]} — ${c.missing.length ? "hesaplanamadı" : c.operational ? tl(c.operational.amount) : `${c.netAmount} ${c.currency}`}`,
          kv: [["TL karşılığı", c.missing.length ? "—" : c.operational ? `${tl(c.operational.amount)}${c.currency !== "TRY" ? ` = ${c.netAmount} ${c.currency} × ${c.operational.rate} (${c.operational.rateSource}, ${c.operational.rateDate})` : ""}` : "Kur yok — hesaplanamadı"],
            ["Tarife sürümü", c.tariffLabel], ["Fiyat listesi kalemi", c.itemCode ? `[${c.itemCode}]` : "—"], ["Formül izi", c.formulaTrace?.join("\n") || "—"], ["Kategori gerekçesi", c.categoryReason], ["Doğrulanmış girdiler", inputs(c.verifiedInputs)], ["Esas birim bedel", c.baseAmount],
            ["Ölçülen / ücretlendirilen", `${v(c.measuredQuantity)} / ${c.billedQuantity} × ${c.billedUnits}`], ["Net oran düzeltmesi", `${(Number(c.adjustmentRate) * 100).toFixed(0)}%`],
            ["Uygulanan kurallar", c.rules.filter((r) => r.applied).map((r) => `${r.ruleCode} ${r.description}: ${r.reason}`).join("\n") || "—"],
            ["Uygulanmayan kurallar", c.rules.filter((r) => !r.applied).map((r) => `${r.ruleCode} ${r.description}: ${r.reason}`).join("\n") || "—"],
            ["Eksik / engel", [...c.missing, ...c.productionBlockers].join("\n") || "Yok"], ["Doğrulama kimliği", c.calcId]] as [string, string][],
        }))], footnotes: ["Hesap deterministiktir: aynı girdi ve aynı tarife sürümü aynı doğrulama kimliğini üretir.", "Kaynağı doğrulanmamış oran veya ücretler üretimde otomatik tahakkuk oluşturamaz.", INVOICE_NOTE] };
  }
}
