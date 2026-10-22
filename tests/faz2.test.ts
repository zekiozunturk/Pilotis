import { describe, it, expect } from "vitest";
import { docFileName, mediaFileName, slug, ymdIstanbul } from "@/lib/docs/naming";
import { declarationImpact, missingInfo } from "@/lib/declaration";
import { canSeeOperation } from "@/lib/scope";
import { buildSpec, type DocInput } from "@/lib/docs/builders";
import { createHash } from "node:crypto";

describe("Dosya adlandırma", () => {
  it("şartnamedeki biçim", () => {
    expect(docFileName("IS_BITIM_RAPORU", "Gemi", new Date("2026-10-22T10:00:00Z"), "OP-2026-000456", 3)).toBe("IS_BITIM_RAPORU_GEMI_20261022_OP000456_V03.pdf");
    expect(docFileName("TALEPNAME", "Gemi", new Date("2026-10-22T10:00:00Z"), "OP-2026-000456", 2)).toBe("TALEPNAME_GEMI_20261022_OP000456_V02.pdf");
    expect(mediaFileName("Römorkör", "Gemi", new Date("2026-10-22T11:30:00Z"), 123, "JPG")).toBe("ROMORKOR_GEMI_20261022T143000_000123.jpg");
  });
  it("Türkçe karakterler ve boşluk", () => expect(slug("Çağrı İş Ölçü ŞÜĞ")).toBe("CAGRI_IS_OLCU_SUG"));
  it("tarih Europe/Istanbul gününe göre (gece yarısı sonrası)", () => expect(ymdIstanbul(new Date("2026-10-22T22:30:00Z"))).toBe("20261023"));
});

describe("Beyan etki analizi", () => {
  it("GT değişimi kritik ve yeniden onay ister", () => {
    const r = declarationImpact({ gt: 2980, engine: "çalışıyor" }, { gt: 3120 });
    expect(r.requiresReapproval).toBe(true);
    expect(r.affected).toContain("Fatura muhatabı onayı");
  });
  it("ilk kez girilen bilgi değişiklik sayılır ama yeniden onay istemez", () => {
    const r = declarationImpact({ gt: 2980 }, { gt: 2980, dgClass: "3" });
    expect(r.changes.map((c) => c.key)).toEqual(["dgClass"]);
    expect(r.requiresReapproval).toBe(false);
  });
  it("aynı değer değişiklik değildir; boş alan silme sayılmaz", () => {
    expect(declarationImpact({ gt: 2980, engine: "çalışıyor" }, { gt: 2980, engine: null }).changes).toHaveLength(0);
  });
  it("eksik bilgi listesi", () => {
    expect(missingInfo({ gt: null, engine: null, cargoCondition: "GAS_FREE" }, "Chemical Tanker")).toEqual(["GT (tonilato belgesi)", "Ana makine durumu", "Gas-free belgesi"]);
  });
});

describe("Kayıt erişim kapsamı", () => {
  const p = { requesterPartyId: "A", billingPartyId: "B", guarantorPartyId: null, agentPartyId: "A" };
  it("personel her kaydı görür", () => expect(canSeeOperation({ external: false, partyId: null }, p)).toBe(true));
  it("fatura muhatabı görür", () => expect(canSeeOperation({ external: true, partyId: "B" }, p)).toBe(true));
  it("başka müşteri göremez", () => expect(canSeeOperation({ external: true, partyId: "C" }, p)).toBe(false));
  it("firması bağlanmamış dış kullanıcı göremez", () => expect(canSeeOperation({ external: true, partyId: null }, p)).toBe(false));
});

describe("Belge içeriği determinizmi", () => {
  const d: DocInput = {
    opRef: "OP-2026-000001", portCallRef: "PC-2026-000001", isDemo: true, typeCode: "OP-001", typeName: "Yanaşma", plannedStart: "22.10.2026 10:00", from: null, to: "Rıhtım",
    vessel: { name: "GEMI", imo: "9000001", flag: "TR", type: "Cargo", gt: "2980", nt: null, dwt: null, loa: null }, requester: "Acente", agent: "Acente",
    billing: null, billingDecision: null, declarations: [{ version: 1, layer: "CUSTOMER_DECLARED", payload: { gt: 2980 }, createdAt: "x" }],
    lines: [{ kind: "PILOTAGE", allocated: null, billable: null, status: "READY", cancelReason: null }], durations: [], events: [], calcs: [], estimates: [], statuses: {},
  };
  const h = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
  it("aynı veri ⇒ aynı özet (yeni sürüm açılmaz)", () => expect(h(buildSpec("TALEPNAME", d))).toBe(h(buildSpec("TALEPNAME", { ...d }))));
  it("fatura muhatabı değişince talepname özeti değişir", () =>
    expect(h(buildSpec("TALEPNAME", d))).not.toBe(h(buildSpec("TALEPNAME", { ...d, billing: { name: "X", taxNumber: "1", taxOffice: null, address: null } }))));
  it("bilinmeyen değer '—' gösterilir, 0 yazılmaz", () => {
    const spec = buildSpec("TALEPNAME", d);
    const kv = spec.sections.find((x) => x.heading === "Gemi")!.kv!;
    expect(kv.find(([k]) => k.startsWith("GT"))![1]).toBe("2980 / — / —");
  });
});
