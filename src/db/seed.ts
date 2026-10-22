import { DEFAULT_ROTATION, teamsOf, rotationShifts } from "../lib/planning/rotation";
import "dotenv/config";
import { db, schema as s } from "./index";
import { FLEET_SEED, OPERATION_TYPES, RULES, OPEN_ISSUES, OPERATOR, DEMO_TARIFF } from "../data/catalog";
import { KRP_PETKIM_REV4 } from "../data/tariffs/krp-petkim-rev4";
import { REFERENCE_CASES } from "../data/reference-cases";
import { TERMS } from "../data/terms";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`TRUNCATE shifts, terms, exchange_rates, app_settings, reference_cases, document_approvals, cart_items, carts, calculation_results, document_versions, timeline_events, assignments, service_lines, service_requests,
    billing_approvals, operations, op_seq, port_calls, vessels, facilities, party_roles, users, personnel_sensitive, certificates,
    personnel, fleet_assets, business_rules, regulation_sources, tariff_versions, tariff_families, operation_types, open_issues, parties, audit_log CASCADE`);

  // İşletme ve kurumlar (gerçek)
  const [yp] = await db.insert(s.parties).values({
    kind: "COMPANY", legalName: OPERATOR.legalName, shortName: "Yalova Pilotaj", address: OPERATOR.address,
    city: "Yalova", phone: OPERATOR.phone, email: OPERATOR.email, website: OPERATOR.website,
  }).returning();
  await db.insert(s.partyRoles).values({ partyId: yp.id, role: "SERVICE_PROVIDER" });

  const authorities: [string, "MINISTRY_DGM" | "HARBOUR_MASTER" | "COASTAL_SAFETY" | "VTS" | "COAST_GUARD"][] = [
    ["T.C. Ulaştırma ve Altyapı Bakanlığı — Denizcilik Genel Müdürlüğü", "MINISTRY_DGM"],
    ["Yalova Liman Başkanlığı", "HARBOUR_MASTER"],
    ["Kıyı Emniyeti Genel Müdürlüğü", "COASTAL_SAFETY"],
    ["Gemi Trafik Hizmetleri (ilgili birim — doğrulanacak)", "VTS"],
    ["Sahil Güvenlik Komutanlığı", "COAST_GUARD"],
  ];
  for (const [name, role] of authorities) {
    const [p] = await db.insert(s.parties).values({ kind: "AUTHORITY", legalName: name }).returning();
    await db.insert(s.partyRoles).values({ partyId: p.id, role });
  }

  const [base] = await db.insert(s.facilities).values({
    name: "Yalova Pilotaj Üssü — Altınova Tersaneler Bölgesi", type: "OPERATOR_BASE", ownerPartyId: yp.id,
    coordSource: "Adres: yalovapilotaj.com — koordinat doğrulanacak (AK-11)", verification: "SOURCE_FOUND",
  }).returning();

  // Filo (gerçek adlar, teknik özellik doğrulanmamış — AK-01)
  await db.insert(s.fleetAssets).values(FLEET_SEED.map((f) => ({ ...f, type: f.type as "TUG", specVerified: false })));

  await db.insert(s.operationTypes).values(OPERATION_TYPES.map((o) => ({
    code: o.code, nameTr: o.nameTr, nameEn: o.nameEn, serviceKinds: o.kinds, tariffFamilies: o.families, unit: o.unit,
  })));

  const [src] = await db.insert(s.regulationSources).values({
    title: "Kılavuzluk, Römorkörcülük ve Palamar Hizmetleri Ücret Yönergesi (19.09.2024 erişilebilen kopya)",
    issuer: "UAB Denizcilik Genel Müdürlüğü", officialUrl: "https://denizcilik.uab.gov.tr/uploads/pages/yonerge-talimat/krp-ucretler.pdf",
  }).returning();
  await db.insert(s.businessRules).values(RULES.map((r) => ({
    code: r.code, title: r.title, label: r.label, status: r.status, basis: r.basis, modules: r.modules,
    sourceId: r.basis.startsWith("KRP") ? src.id : null,
  })));
  await db.insert(s.openIssues).values(OPEN_ISSUES);
  // Gerçek TCMB bülteni (kaynak: https://www.tcmb.gov.tr/kurlar/today.xml, 21.10.2026, Bülten 2026/199)
  await db.insert(s.exchangeRates).values([
    { currency: "USD", bulletinDate: "2026-10-21", bulletinNo: "2026/199", forexBuying: "49.5123", forexSelling: "49.6015", source: "TCMB", enteredBy: "seed" },
    { currency: "EUR", bulletinDate: "2026-10-21", bulletinNo: "2026/199", forexBuying: "55.5780", forexSelling: "55.6781", source: "TCMB", enteredBy: "seed" },
  ]);
  await db.insert(s.appSettings).values({ key: "fx.policy", value: { rateType: "FOREX_SELLING", dateRule: "COMPLETION_DAY_BULLETIN", preferSource: "TCMB" }, updatedBy: "BUSINESS_MANAGER" });
  await db.insert(s.auditLog).values({ entity: "app_settings", entityId: "fx.policy", action: "UPDATE", after: { rateType: "FOREX_SELLING", dateRule: "COMPLETION_DAY_BULLETIN" }, actorId: "BUSINESS_MANAGER", reason: "İşletme kararı (22.10.2026): TCMB döviz satış; işin bittiği günün kuru, hafta sonu biterse cuma 15:30 kuru" });

  const [fam] = await db.insert(s.tariffFamilies).values({ kind: "MINISTRY", name: "Bakanlık KRP hizmet tarifesi" }).returning();
  await db.insert(s.tariffVersions).values({
    id: DEMO_TARIFF.id, familyId: fam.id, label: DEMO_TARIFF.label, validFrom: new Date(DEMO_TARIFF.validFrom),
    validTo: new Date(DEMO_TARIFF.validTo), currency: DEMO_TARIFF.currency, status: DEMO_TARIFF.status,
    definition: DEMO_TARIFF.definition, sourceRuleCodes: ["R-005", "R-006", "R-009", "R-015"], isDemo: true,
    preparedBy: "seed", changeNote: "Motor davranışını göstermek için örnek yapı — resmî rakam değildir",
  });
  await db.insert(s.tariffVersions).values({
    id: KRP_PETKIM_REV4.id, familyId: fam.id, label: KRP_PETKIM_REV4.label, validFrom: new Date(KRP_PETKIM_REV4.validFrom),
    validTo: new Date(KRP_PETKIM_REV4.validTo), currency: "USD", status: "SOURCE_FOUND", definition: KRP_PETKIM_REV4.definition,
    sourceRuleCodes: ["R-005", "R-009", "R-023", "R-024", "R-025", "R-026", "R-027", "R-028"], preparedBy: "TARIFF_OFFICER",
    changeNote: "Petkim ABU-TRO-LST-0141 Rev.4 (31.12.2025) tablolarından aynen aktarıldı",
  });
  await db.insert(s.referenceCases).values(REFERENCE_CASES.map((r) => ({
    code: r.code, title: r.title, tariffVersionId: r.versionId, source: r.source, input: r.input, expected: r.expected, working: r.working, preparedBy: "TARIFF_OFFICER",
  })));
  for (const [kind, name] of [["KEGM", "Kıyı Emniyeti hizmet tarifesi"], ["CHARTER", "Deniz aracı kiralama"], ["SALVAGE", "Kurtarma-yardım değerlendirmesi"], ["SPECIAL_CONTRACT", "Özel hizmet sözleşmeleri"]] as const) {
    await db.insert(s.tariffFamilies).values({ kind, name });
  }

  // ───── ÖRNEK veriler (isDemo) ─────
  const [agent] = await db.insert(s.parties).values({ kind: "COMPANY", legalName: "ÖRNEK Denizcilik Acenteliği Ltd.", taxNumber: "0000000001", isDemo: true }).returning();
  const [yard] = await db.insert(s.parties).values({ kind: "COMPANY", legalName: "ÖRNEK Tersanecilik A.Ş.", taxNumber: "0000000002", city: "Yalova", isDemo: true }).returning();
  const [owner] = await db.insert(s.parties).values({ kind: "COMPANY", legalName: "ÖRNEK Shipping Co.", country: "MT", isDemo: true }).returning();
  await db.insert(s.partyRoles).values([
    { partyId: agent.id, role: "AGENT" }, { partyId: yard.id, role: "SHIPYARD" }, { partyId: yard.id, role: "BILLING_PARTY" }, { partyId: owner.id, role: "OWNER" },
  ]);
  const [yardFac] = await db.insert(s.facilities).values({ name: "ÖRNEK Tersane Rıhtımı", type: "SHIPYARD", ownerPartyId: yard.id, isDemo: true }).returning();

  const [v1] = await db.insert(s.vessels).values({ name: "ÖRNEK AURORA", imo: "9000001", flag: "MT", vesselType: "Chemical Tanker", gt: "8450", nt: "4020", dwt: "12900", loa: "128.60", beam: "20.40", isDemo: true }).returning();
  const [v2] = await db.insert(s.vessels).values({ name: "ÖRNEK MARMARA STAR", imo: "9000002", flag: "TR", vesselType: "General Cargo", gt: "2980", isDemo: true }).returning();
  await db.insert(s.vessels).values({ name: "ÖRNEK YENİ İNŞA 101", altOfficialId: "Tersane inşa no 101", vesselType: "Yeni inşa (GT bilinmiyor)", isDemo: true });

  const [pc] = await db.insert(s.portCalls).values({ ref: "PC-2026-000001", vesselId: v1.id, agentPartyId: agent.id, lastPort: "Aliağa", cargoCondition: "EMPTY_NOT_CLEANED", repairPurpose: "Klas bakımı", isDemo: true }).returning();
  const [pc2] = await db.insert(s.portCalls).values({ ref: "PC-2026-000002", vesselId: v2.id, agentPartyId: agent.id, lastPort: "Gemlik", cargoCondition: "BALLAST", isCabotage: true, isDemo: true }).returning();
  await db.insert(s.opSeq).values({ year: 2026, last: 2 });

  const [op1] = await db.insert(s.operations).values({
    ref: "OP-2026-000001", portCallId: pc.id, typeCode: "OP-005", fromFacilityId: base.id, toFacilityId: yardFac.id,
    plannedStart: new Date("2026-10-22T07:00:00Z"), requesterPartyId: agent.id, billingPartyId: yard.id,
    requestStatus: "ACCEPTED", approvalStatus: "COMPLETE", planningStatus: "FIRM", opStatus: "COMPLETED", accrualStatus: "IN_REVIEW", isDemo: true,
  }).returning();
  await db.insert(s.billingApprovals).values({ operationId: op1.id, billingPartyId: yard.id, taxVerified: true, authorizedPerson: "ÖRNEK Yetkili", decision: "APPROVED", decidedAt: new Date("2026-10-21T15:00:00Z") });
  await db.insert(s.serviceRequests).values([
    { operationId: op1.id, version: 1, layer: "CUSTOMER_DECLARED", payload: { gt: 8450, engine: "çalışıyor", cargo: "boş, temizlenmemiş" } },
    { operationId: op1.id, version: 2, layer: "FIELD_VERIFIED", payload: { gt: 8450, engine: "çalışıyor", cargo: "boş, temizlenmemiş", gasFree: false }, reason: "Saha kontrolü" },
  ]);
  await db.insert(s.serviceLines).values([
    { operationId: op1.id, kind: "PILOTAGE", allocatedUnits: 1, billableUnits: 1, status: "COMPLETED" },
    { operationId: op1.id, kind: "TOWAGE", allocatedUnits: 2, billableUnits: 2, status: "COMPLETED" },
    { operationId: op1.id, kind: "MOORING", allocatedUnits: 1, billableUnits: 1, status: "COMPLETED" },
  ]);
  const tugs = await db.select().from(s.fleetAssets);
  const t2 = tugs.find((t) => t.name === "Yalova 2")!; const t3 = tugs.find((t) => t.name === "Yalova 3")!;
  const ev = (type: string, at: string, serviceKind?: string, assetId?: string) => ({ operationId: op1.id, type: type as "SERVICE_START", occurredAt: new Date(at), serviceKind: serviceKind as "TOWAGE" | undefined, assetId });
  await db.insert(s.timelineEvents).values([
    ev("TASK_ACCEPTED", "2026-10-22T06:20:00Z"),
    ev("TRANSIT_START", "2026-10-22T06:30:00Z"),
    ev("ARRIVED_SITE", "2026-10-22T06:55:00Z"),
    ev("DECLARATION_CHECKED", "2026-10-22T06:58:00Z"),
    ev("PILOT_BOARDED", "2026-10-22T07:02:00Z", "PILOTAGE"),
    ev("TUG_ALONGSIDE", "2026-10-22T07:10:00Z", "TOWAGE", t2.id),
    ev("TUG_ALONGSIDE", "2026-10-22T07:14:00Z", "TOWAGE", t3.id),
    ev("MOORING_START", "2026-10-22T08:00:00Z", "MOORING"),
    ev("SERVICE_END", "2026-10-22T08:11:00Z", "TOWAGE", t2.id),
    ev("SERVICE_END", "2026-10-22T08:12:00Z", "TOWAGE", t3.id),
    ev("SERVICE_END", "2026-10-22T08:25:00Z", "MOORING"),
    ev("PILOT_DISEMBARKED", "2026-10-22T08:30:00Z", "PILOTAGE"),
  ]);

  await db.insert(s.operations).values({
    ref: "OP-2026-000002", portCallId: pc2.id, typeCode: "OP-001", toFacilityId: yardFac.id,
    plannedStart: new Date("2026-10-23T10:00:00Z"), requesterPartyId: agent.id, billingPartyId: null,
    requestStatus: "SUBMITTED", approvalStatus: "AWAITING_BILLING_PARTY", isDemo: true,
  });

  // ───── Örnek personel ve vardiyalar (AK-09 gelene kadar; isDemo) ─────
  // İşletme beyanı (22.10.2026): 7 römorkör (5 gündüz, 2 gece), römorkörde 4 kişi, 1 hafta her gün 14 saat görev + 1 hafta izin.
  const rot = DEFAULT_ROTATION;
  await db.insert(s.appSettings).values({ key: "planning.rotation", value: rot, updatedBy: "seed" });
  await db.insert(s.auditLog).values({ entity: "setting", entityId: "planning.rotation", action: "CREATE", after: rot as unknown as object, actorId: "seed", reason: "İşletme beyanı: 1 hafta × 14 saat görev / 1 hafta izin; 5 gündüz + 2 gece römorkör; römorkörde 4 kişi" });
  const tugAssets = new Map((await db.select().from(s.fleetAssets)).map((a) => [a.name, a.id]));
  const people: { id: string; crewRole: string; tug?: string; team?: string; letter?: string; name: string; rotationTeam: string | null }[] = [];
  for (const t of teamsOf(rot)) for (const r of rot.roles) {
    const [p] = await db.insert(s.personnel).values({ fullName: `ÖRNEK ${r.label} · ${t.tugName.replace(" (ad girilecek)", "")} · ${t.letter}`, title: r.label, unit: `${t.tugName.replace(" (ad girilecek)", "")} ekipleri`, crewRole: r.code, homeAssetId: tugAssets.get(t.tugName) ?? null, workProfile: "STCW_MLC", rotationTeam: t.key, isDemo: true }).returning();
    people.push({ id: p.id, crewRole: r.code, tug: t.tugName, letter: t.letter, name: p.fullName, rotationTeam: t.key });
  }
  // Yedek havuzu (ekibe atanmamış) — 2 kişi örnek
  for (const [cr, title] of [["KAPTAN", "Römorkör Kaptanı"], ["PIMCI", "Pimci"]] as const) {
    const [p] = await db.insert(s.personnel).values({ fullName: `ÖRNEK ${title} · Yedek`, title, unit: "Yedek havuzu", crewRole: cr, workProfile: "STCW_MLC", isDemo: true }).returning();
    people.push({ id: p.id, crewRole: cr, name: p.fullName, rotationTeam: null });
  }
  for (let i = 1; i <= 3; i++) {
    const [p] = await db.insert(s.personnel).values({ fullName: `ÖRNEK Kılavuz Kaptan ${i}`, title: "Kılavuz Kaptan", unit: "Kılavuzluk", crewRole: "KILAVUZ", workProfile: "STCW_MLC", isDemo: true }).returning();
    people.push({ id: p.id, crewRole: "KILAVUZ", name: p.fullName, rotationTeam: null });
  }
  for (let i = 1; i <= 2; i++) {
    const [p] = await db.insert(s.personnel).values({ fullName: `ÖRNEK Kıyı Operasyon ${i}`, title: "Kıyı Operasyon Sorumlusu", unit: "Operasyon", crewRole: "KIYI_OPS", workProfile: "IS_KANUNU", isDemo: true }).returning();
    people.push({ id: p.id, crewRole: "KIYI_OPS", name: p.fullName, rotationTeam: null });
  }
  // Yeterlik belgeleri — biri süresi dolmuş, biri yakında dolacak (planlama kontrolü örneği)
  for (const [i, p] of people.entries()) {
    const exp = i === 5 ? "2026-10-15" : i === 9 ? "2026-11-03" : "2027-08-31";
    await db.insert(s.certificates).values({ personnelId: p.id, name: p.crewRole === "KILAVUZ" ? "Kılavuz kaptan yetki belgesi" : p.crewRole === "KIYI_OPS" ? "İSG eğitimi" : "Gemiadamı yeterlik belgesi", number: `ÖRNEK-${1000 + i}`, issuedAt: new Date("2022-01-01"), expiresAt: new Date(`${exp}T23:59:59+03:00`) });
  }
  const tr = (d: string, h: string) => new Date(`${d}T${h}:00+03:00`);
  const cutoff = new Date("2026-10-22T12:00:00+03:00");
  const rows: (typeof s.shifts.$inferInsert)[] = [];
  const add = (pid: string, cat: "WORK" | "STANDBY" | "TRAINING" | "LEAVE", a: Date, b: Date, note?: string, assetId?: string | null) => rows.push({ personnelId: pid, category: cat, status: a < cutoff ? "CONFIRMED" : "PLANNED", startAt: a, endAt: b, note, assetId: assetId ?? null, createdBy: "seed", isDemo: true });
  // Rotasyon vardiyaları (takvime uygula ile aynı üretici) — 05.10–09.11
  for (const r of rotationShifts(rot, people, tr("2026-10-05", "00:00").getTime(), tr("2026-11-09", "00:00").getTime())) add(r.personnelId, "WORK", new Date(r.start), new Date(r.end), r.note, tugAssets.get(r.tugName));
  // Kılavuz kaptan ve kıyı personeli (rotasyon dışı)
  const days = Array.from({ length: 28 }, (_, i) => new Date(Date.UTC(2026, 9, 12 + i)).toISOString().slice(0, 10));
  const next = (d: string) => new Date(new Date(`${d}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  people.filter((p) => p.crewRole === "KILAVUZ" || p.crewRole === "KIYI_OPS").forEach((p, i) => {
    days.forEach((d, di) => {
      const dow = di % 7; // 0 = pazartesi
      if (p.crewRole === "KIYI_OPS") { if (dow < 5 || (i % 2 === 0 && dow === 5)) add(p.id, "WORK", tr(d, "08:00"), tr(d, "17:00")); return; }
      if ((di + i) % 2 === 0) add(p.id, "WORK", tr(d, "07:00"), tr(d, "19:00")); else if ((di + i) % 4 === 1) add(p.id, "STANDBY", tr(d, "19:00"), tr(next(d), "07:00"), "Gece hazır bulunma");
    });
  });
  const pick = (tug: string, letter: string, cr: string) => people.find((p) => p.tug === tug && p.letter === letter && p.crewRole === cr)!;
  // Bilinçli ihlal örneği: Yalova 5 (gece) B ekibi kaptanı gece görevinden çıkıp aynı sabah ek göreve yazılmış
  add(pick("Yalova 5", "B", "KAPTAN").id, "WORK", tr("2026-10-23", "08:00"), tr("2026-10-23", "16:00"), "Ek görev (örnek ihlal)");
  // Eğitim (izin haftasındaki A ekibinden) ve yıllık izin (görevdeki B ekibinden) örnekleri
  add(pick("Yalova 2", "A", "YAGCI").id, "TRAINING", tr("2026-10-24", "09:00"), tr("2026-10-24", "13:00"), "Yangın tatbikatı");
  const y3p = pick("Yalova 3", "B", "PIMCI");
  for (const r of rows.filter((r) => r.personnelId === y3p.id && r.startAt >= tr("2026-10-22", "00:00") && r.startAt < tr("2026-10-24", "00:00"))) rows.splice(rows.indexOf(r), 1);
  add(y3p.id, "LEAVE", tr("2026-10-22", "00:00"), tr("2026-10-24", "00:00"), "Yıllık izin");
  for (let i = 0; i < rows.length; i += 500) await db.insert(s.shifts).values(rows.slice(i, i + 500));

  // Terminoloji
  await db.insert(s.terms).values(TERMS.map((t) => ({
    number: t.n, slug: t.slug, tr: t.tr, aliases: t.aliases, definition: t.def, source: t.source ?? null, confusedWith: t.confused ?? null,
    translations: Object.fromEntries(Object.entries(t.t).map(([k, v]) => [k, { text: v, reviewed: false }])), status: "TASLAK",
  })));

  console.log("Tohumlama tamam.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
