import { describe, it, expect } from "vitest";
import { union, total, byDay, splitDayNight, allocate, sumSingle, sumByCurrency, CurrencyMixError, H, MIN, convert } from "@/lib/analytics/core";
import { makeScope, allocateRevenue, relatedNet, financeSummary, opFinance, personStats, assetStats, results, linesInScope, DEFAULT_ALLOC, type Dataset, type DOp, type DPerson, type DAsset, type Filter, type DInvoice } from "@/lib/analytics/model";
import { balance, alertsFor } from "@/lib/analytics/insights";
import { analyticsAccess, TABS } from "@/lib/analytics/access";

const T = (s: string) => new Date(`${s}:00+03:00`).getTime();
const person = (id: string, crewRole: string, teamKey: string | null = null): DPerson => ({ id, name: id, title: crewRole, crewRole, teamKey, unit: null, photoUrl: null, workProfile: "STCW_MLC" });
const tug = (id: string, mode: "DAY" | "NIGHT" = "DAY"): DAsset => ({ id, code: id, name: id, type: "TUG", bollardPullT: null, photoUrl: null, mode });
const op = (id: string, a: string, b: string, extra: Partial<DOp> = {}): DOp => ({
  id, ref: id, typeCode: "OP-001", typeName: "Yanaşma", vesselId: "v", vesselName: "v", gt: 5000, billingPartyId: "c1", agentPartyId: null, facilityId: null, priority: "NORMAL",
  plannedStart: T(a), plannedEnd: T(b), opStatus: "COMPLETED", accrualStatus: "APPROVED", accountingStatus: "INVOICED", cancelReason: null, kinds: ["TOWAGE"], plannedTugs: 2, tariffVersionId: null,
  events: [{ type: "TRANSIT_START", at: T(a) - 30 * MIN }, { type: "ARRIVED_SITE", at: T(a) }, { type: "SERVICE_START", at: T(a) }, { type: "SERVICE_END", at: T(b) }, { type: "RETURN_START", at: T(b) }, { type: "RETURN_END", at: T(b) + 30 * MIN }],
  ...extra,
});
const inv = (id: string, opId: string, cents: number, issue: string, kind: "INVOICE" | "CREDIT_NOTE" = "INVOICE", kindLine = "TOWAGE"): DInvoice => ({ id, number: id, kind, partyId: "c1", issueDate: issue, currency: "TRY", cents, taxCents: Math.round(cents * 0.2), status: "ISSUED", disputedCents: 0, disputeNote: null, correctsId: null, lines: [{ id: `${id}-l1`, invoiceId: id, opId, kind: kindLine, cents, taxCents: Math.round(cents * 0.2), description: "" }] });
const base = (over: Partial<Dataset> = {}): Dataset => ({
  asOf: T("2026-11-30T12:00"), ops: [], persons: [], assets: [], shifts: [], parts: [], plans: [], downtime: [], meters: [], calcs: [], invoices: [], payments: [], costs: [], devs: [], manual: [],
  parties: {}, facilities: {}, teamOfPerson: {}, teamAsset: {}, alloc: DEFAULT_ALLOC, night: { startH: 20, endH: 6 }, lastUpdates: { accounting: T("2026-11-29T12:00") }, ...over,
});
const F = (from: string, to: string, extra: Partial<Filter> = {}): Filter => ({ from: T(from), to: T(to), grain: "month", basis: "SERVICE", ...extra });

describe("Analiz kabul testleri (şartname §17)", () => {
  it("1 · Bir işte iki römorkör çalışınca gelir iki kez sayılmıyor", () => {
    const ds = base({
      assets: [tug("R1"), tug("R2")], ops: [op("op1", "2026-10-05T10:00", "2026-10-05T11:00")],
      parts: [
        { id: "a", opId: "op1", personnelId: null, assetId: "R1", role: null, from: T("2026-10-05T09:30"), to: T("2026-10-05T11:30"), source: "OFFICIAL", approved: true, note: null },
        { id: "b", opId: "op1", personnelId: null, assetId: "R2", role: null, from: T("2026-10-05T09:30"), to: T("2026-10-05T10:30"), source: "OFFICIAL", approved: true, note: null },
      ],
      invoices: [inv("i1", "op1", 1_000_001, "2026-10-06")],
    });
    const r = allocateRevenue(ds, ds.invoices[0].lines, "ASSET");
    const sum = r.rows.reduce((s, x) => s + x.cents, 0);
    expect(sum).toBe(1_000_001);                       // kuruşu kuruşuna mutabık
    expect(r.rows.find((x) => x.targetId === "R1")!.cents).toBe(666_667); // 120 dk / 180 dk
    expect(relatedNet(ds, ["op1"])).toBe(1_000_001);    // her römorkörün "katıldığı işler" görünümü tam tutar…
    expect(relatedNet(ds, ["op1"]) * 2).not.toBe(sum);  // …ama filo toplamı dağıtılmış gelirden alınır
  });

  it("2 · Birden fazla personel bulununca personel ilişkili gelirleri şirket toplamına eklenmiyor", () => {
    const ps = ["k", "b", "y", "p"].map((x, i) => person(x, ["KAPTAN", "BASCARKCI", "YAGCI", "PIMCI"][i], "R1-A"));
    const ds = base({
      persons: ps, assets: [tug("R1")], ops: [op("op1", "2026-10-05T10:00", "2026-10-05T11:00")],
      parts: ps.map((p, i) => ({ id: `p${i}`, opId: "op1", personnelId: p.id, assetId: "R1", role: null, from: T("2026-10-05T09:30"), to: T("2026-10-05T11:30"), source: "OFFICIAL", approved: true, note: null })),
      invoices: [inv("i1", "op1", 400_000, "2026-10-06")],
    });
    const sc = makeScope(ds, F("2026-10-01T00:00", "2026-11-01T00:00"));
    const fs = financeSummary(sc);
    expect(fs.net).toBe(400_000);
    const al = allocateRevenue(ds, linesInScope(sc), "PERSONNEL");
    expect(al.rows.length).toBe(4);
    expect(al.rows.reduce((s, r) => s + r.cents, 0)).toBe(fs.net);   // dağıtılmış toplam = şirket geliri
    expect(ps.map(() => relatedNet(ds, ["op1"])).reduce((a, b) => a + b, 0)).toBe(4 * fs.net); // ilişkili tutarlar toplanırsa şişer — bu yüzden toplanmaz
  });

  it("3 · Vardiya değişiminde çalışma saatleri doğru bölünüyor", () => {
    const A = person("A", "KAPTAN", "R1-A"), B = person("B", "KAPTAN", "R1-B");
    const ds = base({
      persons: [A, B], assets: [tug("R1")], ops: [op("op1", "2026-10-05T18:00", "2026-10-05T21:00")],
      shifts: [
        { id: "sA", personnelId: "A", category: "WORK", status: "CONFIRMED", start: T("2026-10-05T07:00"), end: T("2026-10-05T19:00"), actualStart: T("2026-10-05T07:00"), actualEnd: T("2026-10-05T19:00"), actualSource: "OFFICIAL", approved: true, overtimeReason: null, correctionReason: null, assetId: "R1", operationId: null, exception: false, note: null },
        { id: "sB", personnelId: "B", category: "WORK", status: "CONFIRMED", start: T("2026-10-05T19:00"), end: T("2026-10-06T07:00"), actualStart: T("2026-10-05T19:00"), actualEnd: T("2026-10-06T07:00"), actualSource: "OFFICIAL", approved: true, overtimeReason: null, correctionReason: null, assetId: "R1", operationId: null, exception: false, note: null },
      ],
      parts: [
        { id: "1", opId: "op1", personnelId: "A", assetId: "R1", role: null, from: T("2026-10-05T17:30"), to: T("2026-10-05T19:00"), source: "OFFICIAL", approved: true, note: "Ekip değişimi" },
        { id: "2", opId: "op1", personnelId: "B", assetId: "R1", role: null, from: T("2026-10-05T19:00"), to: T("2026-10-05T21:30"), source: "OFFICIAL", approved: true, note: "Ekip değişimi" },
      ],
    });
    const sc = makeScope(ds, F("2026-10-05T00:00", "2026-10-07T00:00"));
    const a = personStats(sc, A), b = personStats(sc, B);
    expect(a.active / MIN).toBe(60);   // 18:00–19:00
    expect(b.active / MIN).toBe(120);  // 19:00–21:00
    expect(a.overtime).toBe(0); expect(b.overtime).toBe(0); // değişim vardiya içinde — fazla mesai yok
    expect(a.actual / H).toBe(12); expect(b.actual / H).toBe(12);
  });

  it("4 · Gece yarısını aşan görev doğru hesaplanıyor", () => {
    const iv: [number, number] = [T("2026-10-05T22:00"), T("2026-10-06T02:30")];
    const d = byDay([iv]);
    expect(d.get("2026-10-05")! / MIN).toBe(120);
    expect(d.get("2026-10-06")! / MIN).toBe(150);
    expect(splitDayNight([iv]).night / MIN).toBe(270);
    expect(splitDayNight([[T("2026-10-05T18:00"), T("2026-10-06T07:00")]]).night / H).toBe(10); // 20:00–06:00
  });

  it("5 · Çakışan zaman aralıkları mükerrer saat üretmiyor", () => {
    expect(total([[0, 10 * H], [5 * H, 12 * H], [20 * H, 21 * H]]) / H).toBe(13);
    expect(union([[0, 5], [5, 7], [9, 10]])).toEqual([[0, 7], [9, 10]]);
    const P = person("P", "KILAVUZ");
    const ds = base({
      persons: [P], ops: [op("o1", "2026-10-05T10:00", "2026-10-05T12:00"), op("o2", "2026-10-05T11:00", "2026-10-05T13:00")],
      parts: [
        { id: "1", opId: "o1", personnelId: "P", assetId: null, role: null, from: T("2026-10-05T10:00"), to: T("2026-10-05T12:00"), source: "OFFICIAL", approved: true, note: null },
        { id: "2", opId: "o2", personnelId: "P", assetId: null, role: null, from: T("2026-10-05T11:00"), to: T("2026-10-05T13:00"), source: "OFFICIAL", approved: true, note: null },
      ],
    });
    const s = personStats(makeScope(ds, F("2026-10-05T00:00", "2026-10-06T00:00")), P);
    expect(s.actual / H).toBe(3);   // 10–13, iki kez sayılmaz (4 değil)
    expect(s.overlaps).toBe(1);     // eşzamanlı kayıt işaretlenir
  });

  it("6 · İptal/iade faturası net gelire doğru yansıyor", () => {
    const ds = base({ ops: [op("op1", "2026-10-05T10:00", "2026-10-05T11:00")], invoices: [inv("i1", "op1", 1_000_000, "2026-10-06"), { ...inv("c1", "op1", -100_000, "2026-10-12", "CREDIT_NOTE"), correctsId: "i1" }] });
    const x = opFinance(ds, "op1");
    expect(x.invoiced).toBe(1_000_000); expect(x.credit).toBe(-100_000); expect(x.net).toBe(900_000);
    const fs = financeSummary(makeScope(ds, F("2026-10-01T00:00", "2026-11-01T00:00", { basis: "INVOICE" })));
    expect(fs.net).toBe(900_000); expect(fs.credit).toBe(-100_000);
  });

  it("7 · Sonradan kesilen fatura doğru hizmet dönemine bağlanıyor", () => {
    const ds = base({ ops: [op("op1", "2026-10-30T10:00", "2026-10-30T11:00")], invoices: [inv("i1", "op1", 500_000, "2026-11-08")] });
    const oct = F("2026-10-01T00:00", "2026-11-01T00:00");
    expect(financeSummary(makeScope(ds, { ...oct, basis: "SERVICE" })).net).toBe(500_000);  // "Ekim'de yapılan işlerin faturaları"
    expect(financeSummary(makeScope(ds, { ...oct, basis: "INVOICE" })).net).toBe(0);        // "Ekim'de kesilen faturalar"
    expect(financeSummary(makeScope(ds, F("2026-11-01T00:00", "2026-12-01T00:00", { basis: "INVOICE" }))).net).toBe(500_000);
  });

  it("8 · Farklı para birimleri doğrudan toplanmıyor", () => {
    expect(() => sumSingle([{ currency: "TRY", cents: 100 }, { currency: "USD", cents: 100 }], "TRY")).toThrow(CurrencyMixError);
    expect(sumByCurrency([{ currency: "TRY", cents: 100 }, { currency: "USD", cents: 5 }, { currency: "TRY", cents: 1 }])).toEqual({ TRY: 101, USD: 5 });
    expect(() => convert({ currency: "USD", cents: 100 }, "TRY", {})).toThrow(CurrencyMixError);
    expect(convert({ currency: "USD", cents: 100 }, "TRY", { "USD/TRY": { rate: 49.6015, date: "2026-10-21", method: "TCMB döviz satış" } }).cents).toBe(4960);
    const ds = base({ ops: [op("op1", "2026-10-05T10:00", "2026-10-05T11:00")], invoices: [inv("i1", "op1", 100_000, "2026-10-06"), { ...inv("i2", "op1", 2_000, "2026-10-07"), currency: "USD" }] });
    const fs = financeSummary(makeScope(ds, F("2026-10-01T00:00", "2026-11-01T00:00", { basis: "INVOICE" })));
    expect(fs.byCurrency).toEqual({ TRY: 100_000, USD: 2_000 });
  });

  it("9 · Eksik maliyetle 'net kâr' gösterilmiyor", () => {
    const ds = base({ ops: [op("op1", "2026-10-05T10:00", "2026-10-05T11:00")], invoices: [inv("i1", "op1", 1_000_000, "2026-10-06")], costs: [{ id: "c", day: "2026-10-05", category: "SUBCONTRACT", nature: "ACTUAL", currency: "TRY", cents: 100_000, opId: "op1", assetId: null, teamKey: null, description: null, allocationBasis: null }] });
    const r = results(makeScope(ds, F("2026-10-01T00:00", "2026-11-01T00:00")), () => ({ key: "a", label: "a" }));
    expect(r.complete).toBe(false);
    expect(r.missingCats).toEqual(expect.arrayContaining(["PERSONNEL", "FUEL", "OVERHEAD"]));
    expect(r.label.toLowerCase()).not.toContain("net kâr");
    expect(r.scopeNote.toLowerCase()).not.toContain("net kâr");
    expect(r.total.contribution).toBe(900_000);
  });

  it("10 · İzinli personel ve bakımdaki araç yanlış performans karşılaştırmasına alınmıyor", () => {
    const mk = (id: string, cat: "WORK" | "LEAVE") => ({ id: `s${id}`, personnelId: id, category: cat, status: "CONFIRMED", start: T("2026-10-05T07:00"), end: T("2026-10-05T21:00"), actualStart: cat === "WORK" ? T("2026-10-05T07:00") : null, actualEnd: cat === "WORK" ? T("2026-10-05T21:00") : null, actualSource: "OFFICIAL", approved: true, overtimeReason: null, correctionReason: null, assetId: null, operationId: null, exception: false, note: null });
    const ps = ["a", "b", "c"].map((x) => person(x, "PIMCI"));
    const ds = base({ persons: ps, shifts: [mk("a", "WORK"), mk("b", "WORK"), mk("c", "LEAVE")], assets: [tug("R1"), tug("R2")], downtime: [{ assetId: "R2", kind: "BREAKDOWN", from: T("2026-10-05T07:00"), to: T("2026-10-05T19:00"), note: null }] });
    ds.shifts.push(...["R1", "R2"].map((t) => ({ ...mk(t, "WORK"), id: `d${t}`, personnelId: "a", assetId: t })));
    const sc = makeScope(ds, F("2026-10-05T00:00", "2026-10-06T00:00"));
    const st = ps.map((p) => personStats(sc, p));
    const b = balance(st).find((x) => x.role === "PIMCI")!;
    expect(b.compared).toBe(2); expect(b.excluded).toBe(1);           // izinli kişi karşılaştırma dışı
    const r2 = assetStats(sc, ds.assets[1]);
    expect(r2.available / H).toBe(2);                                  // 14 sa görev − 12 sa arıza
    expect(r2.down.BREAKDOWN / H).toBe(12);
    const al = alertsFor(sc, st, [assetStats(sc, ds.assets[0]), r2]);
    expect(al.some((a) => a.code === "TUG_BAL")).toBe(false);          // kullanılabilirliği düşük araç dengesizlik uyarısına girmez
    expect(al.some((a) => a.code === "LOAD" && a.title.includes("c"))).toBe(false);
  });

  it("11 · Yetkisiz kullanıcı finansal veya kişisel ayrıntıya ulaşamıyor", () => {
    expect(analyticsAccess("PLANNER").finance).toBe(false);
    expect(analyticsAccess("OPERATIONS_MANAGER").personCost).toBe(false);
    expect(analyticsAccess("CREW").people).toBe("SELF");
    expect(analyticsAccess("TUG_MASTER").people).toBe("TEAM");
    expect(analyticsAccess("CUSTOMER").any).toBe(false);
    expect(analyticsAccess("ACCOUNTING").people).toBe("NONE");
    expect(TABS.filter((t) => t.need(analyticsAccess("PLANNER"))).map((t) => t.href)).not.toContain("/analiz/finans");
    expect(TABS.filter((t) => t.need(analyticsAccess("CREW"))).map((t) => t.href)).toEqual(["/analiz/personel", "/analiz/emniyet"]);
  });

  it("12 · Toplam göstergeler detay kayıtlarla ve dağıtımla mutabık", () => {
    const ds = base({
      assets: [tug("R1"), tug("R2")],
      ops: [op("o1", "2026-10-05T10:00", "2026-10-05T11:00"), op("o2", "2026-10-06T10:00", "2026-10-06T12:00"), op("o3", "2026-10-07T10:00", "2026-10-07T11:00", { kinds: ["PILOTAGE"] })],
      parts: [
        { id: "1", opId: "o1", personnelId: null, assetId: "R1", role: null, from: T("2026-10-05T09:30"), to: T("2026-10-05T11:30"), source: "OFFICIAL", approved: true, note: null },
        { id: "2", opId: "o2", personnelId: null, assetId: "R1", role: null, from: T("2026-10-06T09:30"), to: T("2026-10-06T12:30"), source: "OFFICIAL", approved: true, note: null },
        { id: "3", opId: "o2", personnelId: null, assetId: "R2", role: null, from: T("2026-10-06T09:30"), to: T("2026-10-06T12:30"), source: "OFFICIAL", approved: true, note: null },
      ],
      invoices: [inv("i1", "o1", 333_333, "2026-10-06"), inv("i2", "o2", 777_777, "2026-10-07"), inv("i3", "o3", 111_111, "2026-10-08", "INVOICE", "PILOTAGE")],
    });
    const sc = makeScope(ds, F("2026-10-01T00:00", "2026-11-01T00:00"));
    const fs = financeSummary(sc);
    const detail = sc.ops.reduce((s, o) => s + opFinance(ds, o.id).net, 0);
    expect(fs.net).toBe(detail);
    const al = allocateRevenue(ds, linesInScope(sc), "ASSET");
    expect(al.allocatedCents + al.unallocated.reduce((s, u) => s + u.cents, 0)).toBe(fs.net); // dağıtılan + dağıtılamayan = kaynak
    expect(al.unallocated[0].reason).toContain("Kılavuzluk");
    expect(al.rows.reduce((s, r) => s + r.cents, 0)).toBe(al.allocatedCents);
    expect(allocate(-100_001, [{ key: "a", weight: 1 }, { key: "b", weight: 1 }, { key: "c", weight: 1 }]).get("a")).toBe(-33_334);
  });
});
