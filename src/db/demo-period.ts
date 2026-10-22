/**
 * ÖRNEK DÖNEM ÜRETİCİSİ — analiz merkezi için 31.08–24.10.2026 arası deterministik demo verisi.
 * Bütün kayıtlar isDemo/“ÖRNEK” işaretlidir; tutarlar ve kurlar gerçek değildir (resmî tarife ve TCMB kuru kullanılmaz).
 * Römorkör ve personel atamaları rotasyon vardiyalarına uyar: gece yalnız gece römorkörleri, vardiya bitişini aşan iş
 * fazla mesai olarak işlenir, ekip değişimini aşan işte katılım iki ekibe bölünür.
 */
import { db, schema as s } from "./index";
import { createId } from "../lib/id";

type ShiftRow = typeof s.shifts.$inferInsert;
export interface DemoPerson { id: string; crewRole: string; tug?: string; letter?: string; rotationTeam: string | null; name: string }
export interface DemoCtx {
  people: DemoPerson[];
  rows: ShiftRow[];                // planlanan vardiyalar (mutasyona uğrar: gerçekleşen alanlar eklenir)
  rowTeam: Map<ShiftRow, string>;  // rotasyon satırı → ekip anahtarı
  tugs: { id: string; code: string; name: string }[];
  pilotBoats: string[]; mooringBoats: string[];
  tariffVersionId: string;
  existing: { agent: string; yard: string; owner: string; yardFac: string; base: string };
  now: Date;
}

const MIN = 60_000, H = 3_600_000, DAY = 86_400_000;
const trDate = (ms: number) => new Date(ms + 3 * H).toISOString().slice(0, 10);
const trHour = (ms: number) => new Date(ms + 3 * H).getUTCHours();
const at = (d: string, hh: number, mm = 0) => new Date(`${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+03:00`).getTime();
const r2 = (x: number) => Math.round(x * 100) / 100;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const OP_MIX: [string, number][] = [["OP-001", 25], ["OP-002", 20], ["OP-005", 14], ["OP-006", 12], ["OP-004", 8], ["OP-003", 6], ["OP-007", 4], ["OP-008", 3], ["OP-009", 3], ["OP-012", 3], ["OP-010", 2]];
const KINDS: Record<string, string[]> = {
  "OP-001": ["PILOTAGE", "TOWAGE", "MOORING"], "OP-002": ["PILOTAGE", "TOWAGE", "UNMOORING"], "OP-003": ["PILOTAGE", "TOWAGE", "MOORING"],
  "OP-004": ["PILOTAGE", "TOWAGE", "UNMOORING", "MOORING"], "OP-005": ["PILOTAGE", "TOWAGE", "MOORING"], "OP-006": ["PILOTAGE", "TOWAGE", "UNMOORING"],
  "OP-007": ["PILOTAGE", "TOWAGE"], "OP-008": ["PILOTAGE"], "OP-009": ["PILOTAGE"], "OP-010": ["TOWAGE", "PILOTAGE"], "OP-012": ["STANDBY_TUG"],
};
const WAIT_REASONS: [string, string, string][] = [
  ["CUSTOMER_PREP", "Gemi manevraya hazır değil (makine/halat hazırlığı)", "Gemi kaptanı bilgilendirildi"],
  ["FACILITY_PREP", "Rıhtım/yer hazır değil — tersane hazırlığı sürüyor", "Tesis sorumlusu bilgilendirildi"],
  ["WEATHER", "Rüzgâr limit üstü — hava düzelene kadar beklendi", ""],
  ["MISSING_INFO", "Beyan eksik (draft/GT teyidi bekleniyor)", "Acente bilgilendirildi"],
];

export async function seedDemoPeriod(c: DemoCtx) {
  const R = rng(20261022);
  const pick = <T,>(xs: T[]) => xs[Math.floor(R() * xs.length)];
  const between = (a: number, b: number) => a + R() * (b - a);
  const weighted = (xs: [string, number][]) => { const t = xs.reduce((a, x) => a + x[1], 0); let r = R() * t; for (const [v, w] of xs) { if ((r -= w) < 0) return v; } return xs[0][0]; };
  const nowMs = c.now.getTime();

  // ── Taraflar, tesisler, gemiler ──
  const mkParty = async (legalName: string, roles: string[], extra: Partial<typeof s.parties.$inferInsert> = {}) => {
    const [p] = await db.insert(s.parties).values({ kind: "COMPANY", legalName, isDemo: true, ...extra }).returning();
    await db.insert(s.partyRoles).values(roles.map((role) => ({ partyId: p.id, role: role as "AGENT" })));
    return p.id;
  };
  const yards = [
    { party: c.existing.yard, fac: c.existing.yardFac, name: "ÖRNEK Tersane Rıhtımı" },
    ...(await Promise.all([["ÖRNEK Altınova Gemi İnşa A.Ş.", "0000000011"], ["ÖRNEK Hersek Tersanecilik Ltd.", "0000000012"], ["ÖRNEK Marmara Yat ve Gemi San.", "0000000013"]].map(async ([n, tax]) => {
      const party = await mkParty(n, ["SHIPYARD", "BILLING_PARTY"], { taxNumber: tax, city: "Yalova" });
      const [f] = await db.insert(s.facilities).values({ name: `${n.replace(/ (A\.Ş\.|Ltd\.|San\.)$/, "")} rıhtımı`, type: "SHIPYARD", ownerPartyId: party, isDemo: true }).returning();
      return { party, fac: f.id, name: f.name };
    }))),
  ];
  const [anch] = await db.insert(s.facilities).values({ name: "ÖRNEK Altınova demir sahası", type: "ANCHORAGE", isDemo: true }).returning();
  const agents = [c.existing.agent, await mkParty("ÖRNEK Marmara Ajans Denizcilik", ["AGENT", "BILLING_PARTY"], { taxNumber: "0000000021" }), await mkParty("ÖRNEK Global Shipping Agency", ["AGENT", "BILLING_PARTY"], { taxNumber: "0000000022" })];
  const owners = [c.existing.owner, await mkParty("ÖRNEK Bosphorus Tankers Ltd.", ["OWNER", "BILLING_PARTY"], { country: "TR", taxNumber: "0000000031" })];
  const VTYPES: [string, number, number][] = [["Chemical Tanker", 4500, 26000], ["General Cargo", 1800, 9000], ["Bulk Carrier", 9000, 44000], ["Container", 7000, 32000], ["Ro-Ro", 12000, 38000], ["Offshore Supply", 1500, 4500], ["Yeni inşa (tersane)", 2500, 15000], ["Tug / Workboat", 300, 900]];
  const NAMES = ["ARGO", "BELLA MARE", "CAPE LIRA", "DENİZ YILDIZI", "EGE KARTALI", "FIONA", "GALATA", "HELIOS", "IRIS", "JASMINE", "KARADENİZ", "LUNA", "MARE NOSTRUM", "NOVA", "OCEAN PRIDE", "POLARIS", "QUEEN ADA", "RIVA", "SEA EAGLE", "TROYA", "ULYSSES", "VEGA", "WAVE RIDER", "ZEFİR"];
  const vessels: { id: string; gt: number; name: string; tr: boolean }[] = [];
  for (const [i, n] of NAMES.entries()) {
    const [vt, lo, hi] = VTYPES[i % VTYPES.length];
    const gt = Math.round(between(lo, hi) / 10) * 10, tr = i % 3 === 0;
    const [v] = await db.insert(s.vessels).values({ name: `ÖRNEK ${n}`, imo: String(9100001 + i), flag: tr ? "TR" : pick(["MT", "PA", "LR", "MH"]), vesselType: vt, gt: String(gt), isDemo: true }).returning();
    vessels.push({ id: v.id, gt, name: v.name, tr });
  }

  // ── Römorkör görev çizelgesi (rotasyondan) ──
  const tugIds = new Set(c.tugs.map((t) => t.id));
  type Duty = { team: string; start: number; end: number; rows: ShiftRow[] };
  const duty = new Map<string, Duty[]>();
  const dutyIdx = new Map<string, Duty>();
  for (const r of c.rows) {
    const team = c.rowTeam.get(r);
    if (!team || !r.assetId || !tugIds.has(r.assetId)) continue;
    const k = `${r.assetId}|${(r.startAt as Date).getTime()}`;
    let d = dutyIdx.get(k);
    if (!d) { d = { team, start: (r.startAt as Date).getTime(), end: (r.endAt as Date).getTime(), rows: [] }; dutyIdx.set(k, d); duty.set(r.assetId, [...(duty.get(r.assetId) ?? []), d]); }
    d.rows.push(r);
  }
  for (const l of duty.values()) l.sort((a, b) => a.start - b.start);
  const dutyAt = (tug: string, t: number) => duty.get(tug)?.find((d) => d.start <= t && t < d.end);
  const tugCode = new Map(c.tugs.map((t) => [t.id, t.code]));
  const tugByCode = new Map(c.tugs.map((t) => [t.code, t.id]));

  // Arıza/bakım (araç kullanılamaz)
  const downtime = [
    { assetId: tugByCode.get("R2")!, kind: "PLANNED_MAINTENANCE", from: at("2026-09-14", 8), to: at("2026-09-16", 17), note: "ÖRNEK periyodik makine bakımı (planlı)" },
    { assetId: tugByCode.get("R5")!, kind: "CERTIFICATE", from: at("2026-09-28", 8), to: at("2026-09-28", 13), note: "ÖRNEK klas sörvey — belge yenileme" },
    { assetId: tugByCode.get("R6")!, kind: "BREAKDOWN", from: at("2026-10-08", 10, 30), to: at("2026-10-10", 18), note: "ÖRNEK sancak ana makine yakıt pompası arızası" },
  ];
  await db.insert(s.assetDowntime).values(downtime.map((d) => ({ ...d, from: new Date(d.from), to: new Date(d.to), createdBy: "seed" })));
  const down = (tug: string, a: number, b: number) => downtime.some((d) => d.assetId === tug && d.from < b && a < d.to);
  const busy = new Map<string, [number, number][]>();
  const isBusy = (asset: string, a: number, b: number) => (busy.get(asset) ?? []).some(([x, y]) => x < b && a < y);
  const book = (asset: string, a: number, b: number) => busy.set(asset, [...(busy.get(asset) ?? []), [a, b]]);
  const freeTugs = (a: number, b: number, prefer: string[] = []) => {
    const ok = c.tugs.map((t) => t.id).filter((id) => { const d = dutyAt(id, a); return d && !down(id, a, b) && !isBusy(id, a, b); });
    return [...prefer.filter((p) => ok.includes(p)), ...ok.filter((x) => !prefer.includes(x)).sort(() => R() - 0.5)];
  };

  // Kılavuz kaptanlar: o an WORK vardiyası olan, yoksa hazır bulunmadaki kaptan çağrılır
  const pilots = c.people.filter((p) => p.crewRole === "KILAVUZ");
  const pilotRows = new Map(pilots.map((p) => [p.id, c.rows.filter((r) => r.personnelId === p.id)]));
  const pilotFor = (t: number, b: number) => {
    const covering = (cat: string) => pilots.filter((p) => pilotRows.get(p.id)!.some((r) => r.category === cat && (r.startAt as Date).getTime() <= t && t < (r.endAt as Date).getTime()) && !isBusy(p.id, t - 40 * MIN, b));
    return covering("WORK")[0] ?? covering("STANDBY")[0] ?? pilots.find((p) => !isBusy(p.id, t - 40 * MIN, b)) ?? pilots[0];
  };

  const fx = (ms: number) => r2(48.3 + 0.024 * ((ms - at("2026-08-31", 0)) / DAY) + 0.08 * Math.sin(ms / (5 * DAY))); // ÖRNEK kur serisi

  const opRows: (typeof s.operations.$inferInsert)[] = [], pcRows: (typeof s.portCalls.$inferInsert)[] = [], slRows: (typeof s.serviceLines.$inferInsert)[] = [];
  const evRows: (typeof s.timelineEvents.$inferInsert)[] = [], partRows: (typeof s.participations.$inferInsert)[] = [], asgRows: (typeof s.assignments.$inferInsert)[] = [];
  const calcRows: (typeof s.calculationResults.$inferInsert)[] = [], devRows: (typeof s.deviations.$inferInsert)[] = [], costRows: (typeof s.costEntries.$inferInsert)[] = [];
  const completed: { opId: string; ref: string; end: number; party: string; final: { kind: string; net: number }[]; calcId: string }[] = [];
  const tugActive = new Map<string, number>(); // tug|gün → aktif saat
  const overtime: { row: ShiftRow; minutes: number; ref: string }[] = [];
  let seq = 2;

  const days: string[] = [];
  for (let t = at("2026-08-31", 12); t <= at("2026-10-24", 12); t += DAY) days.push(trDate(t));
  for (const d of days) {
    const n = 3 + Math.floor(R() * 4) + (new Date(`${d}T12:00:00Z`).getUTCDay() % 6 === 0 ? -1 : 0);
    const starts = Array.from({ length: n }, () => { const night = R() < 0.27; const h = night ? pick([21, 22, 23, 0, 1, 2, 3, 4, 5, 6]) : 7 + Math.floor(R() * 13); return at(d, h, pick([0, 15, 30, 45])); }).sort((a, b) => a - b);
    for (const planned of starts) {
      const type = weighted(OP_MIX), kinds = KINDS[type];
      const v = pick(vessels), gtCap = Math.min(v.gt, 120_000);
      const isTow = kinds.includes("TOWAGE") || kinds.includes("STANDBY_TUG");
      const tugsNeeded = kinds.includes("STANDBY_TUG") ? 1 : !kinds.includes("TOWAGE") ? 0 : v.gt < 3000 ? 1 : v.gt < 15000 ? 2 : 3;
      const estMin = type === "OP-007" ? between(240, 420) : type === "OP-012" ? between(240, 600) : type === "OP-010" ? between(150, 260) : type === "OP-004" ? between(90, 150) : between(45, 100);
      const plannedEnd = planned + estMin * MIN;
      const ref = `OP-2026-${String(++seq).padStart(6, "0")}`;
      const opId = createId(), pcId = createId();
      const yard = pick(yards), viaAgent = R() < 0.55;
      const billing = type === "OP-005" || type === "OP-006" || type === "OP-003" ? yard.party : viaAgent ? pick(agents) : pick(owners);
      const priority = R() < 0.05 ? "MANDATORY" : R() < 0.03 ? "EMERGENCY" : "NORMAL";
      pcRows.push({ id: pcId, ref: `PC-2026-${String(seq).padStart(6, "0")}`, vesselId: v.id, agentPartyId: viaAgent ? billing : agents[0], isCabotage: v.tr, cargoCondition: pick(["LADEN", "BALLAST", "EMPTY_NOT_CLEANED", "GAS_FREE"] as const), isDemo: true });
      const isFuture = planned > nowMs;
      const facIsAnch = type === "OP-008" || type === "OP-009";

      // Planlanan kaynaklar
      const plannedTugs = tugsNeeded ? freeTugs(planned - 35 * MIN, plannedEnd + 35 * MIN).slice(0, tugsNeeded) : [];
      const plannedPilot = kinds.includes("PILOTAGE") ? pilotFor(planned, plannedEnd) : null;
      for (const t of plannedTugs) asgRows.push({ operationId: opId, assetId: t, roleOnTask: "Römorkör", from: new Date(planned - 35 * MIN), to: new Date(plannedEnd + 35 * MIN), firm: true });
      if (plannedPilot) asgRows.push({ operationId: opId, personnelId: plannedPilot.id, roleOnTask: "Kılavuz kaptan", from: new Date(planned - 40 * MIN), to: new Date(plannedEnd + 30 * MIN), firm: true });

      const base = { id: opId, ref, portCallId: pcId, typeCode: type, fromFacilityId: facIsAnch ? anch.id : c.existing.base, toFacilityId: facIsAnch ? anch.id : yard.fac, requestedAt: new Date(planned - between(4, 48) * H), plannedStart: new Date(planned), plannedEnd: new Date(plannedEnd), priority, isAuthorityTask: priority !== "NORMAL", requesterPartyId: billing, billingPartyId: billing, isDemo: true };
      if (isFuture) {
        opRows.push({ ...base, requestStatus: "ACCEPTED", approvalStatus: "COMPLETE", planningStatus: R() < 0.7 ? "FIRM" : "TENTATIVE", opStatus: "READY" });
        for (const k of kinds) slRows.push({ operationId: opId, kind: k as "TOWAGE", allocatedUnits: k === "TOWAGE" ? tugsNeeded : 1, status: "READY" });
        estimate();
        continue;
      }

      // Sapma senaryosu
      const roll = R();
      const cancel = roll < 0.035, partial = !cancel && roll < 0.045;
      const wait = !cancel && R() < 0.2 ? pick(WAIT_REASONS) : null;
      const waitMin = wait ? Math.round(between(15, wait[0] === "WEATHER" ? 180 : 100)) : 0;
      const lateStart = !cancel && R() < 0.07 ? pick([["EMERGENCY_TASK", "Kaynak önceki acil göreve yönlendirildi"], ["PLAN_CHANGE", "Acente talebiyle saat değişti"], ["DECLARATION_CHANGE", "Beyan değişti — römorkör sayısı yeniden değerlendirildi"]] as const) : null;
      const lateMin = lateStart ? Math.round(between(20, 90)) : 0;
      const T0 = planned + lateMin * MIN;
      const transit = T0 - 35 * MIN, arrived = T0 - 5 * MIN;
      const svcStart = T0 + waitMin * MIN;
      const durMin = cancel ? 0 : estMin * between(0.8, 1.3) * (partial ? 0.5 : 1);
      const svcEnd = svcStart + durMin * MIN;
      const retEnd = (cancel ? arrived + 20 * MIN : svcEnd + 5 * MIN) + 30 * MIN;
      const actualTugs = tugsNeeded ? freeTugs(transit, retEnd, plannedTugs).slice(0, tugsNeeded) : [];
      const pilot = kinds.includes("PILOTAGE") ? pilotFor(svcStart, svcEnd) : null;

      const ev = (type: string, t: number, extra: Partial<typeof s.timelineEvents.$inferInsert> = {}) => evRows.push({ operationId: opId, type: type as "SERVICE_START", occurredAt: new Date(t), receivedAt: new Date(t + 30_000), createdById: "seed", ...extra });
      ev("TASK_ACCEPTED", transit - 15 * MIN); ev("TRANSIT_START", transit); ev("ARRIVED_SITE", arrived); ev("DECLARATION_CHECKED", arrived + 2 * MIN);
      if (wait) { ev("WAIT_START", T0, { reasonCode: wait[0], note: wait[1] }); ev("WAIT_END", svcStart, { reasonCode: wait[0] }); }
      if (cancel) {
        ev("CANCEL_OR_INCOMPLETE", arrived + 15 * MIN, { reasonCode: "CUSTOMER_PREP", note: "Gemi manevraya hazır olmadığı için iş iptal edildi (ÖRNEK)" });
      } else {
        if (pilot) ev("PILOT_BOARDED", svcStart - 10 * MIN, { serviceKind: "PILOTAGE" });
        for (const t of actualTugs) { ev("TUG_ALONGSIDE", svcStart, { serviceKind: kinds.includes("STANDBY_TUG") ? "STANDBY_TUG" : "TOWAGE", assetId: t }); ev("SERVICE_END", svcEnd, { serviceKind: kinds.includes("STANDBY_TUG") ? "STANDBY_TUG" : "TOWAGE", assetId: t }); }
        if (kinds.includes("MOORING")) { ev("MOORING_START", svcEnd - 15 * MIN, { serviceKind: "MOORING" }); ev("SERVICE_END", svcEnd + 5 * MIN, { serviceKind: "MOORING" }); }
        ev("SERVICE_START", svcStart); ev("SERVICE_END", svcEnd);
        if (pilot) ev("PILOT_DISEMBARKED", svcEnd + 10 * MIN, { serviceKind: "PILOTAGE" });
        if (partial) ev("CANCEL_OR_INCOMPLETE", svcEnd, { reasonCode: "WEATHER", note: "Hava koşulları nedeniyle iş yarıda bırakıldı (ÖRNEK)" });
      }
      ev("RETURN_START", retEnd - 30 * MIN); ev("RETURN_END", retEnd);

      // Fiilî katılım: römorkör + görevdeki ekip (vardiya sınırında bölünür / fazla mesai)
      for (const t of actualTugs) {
        book(t, transit, retEnd);
        partRows.push({ operationId: opId, assetId: t, roleOnTask: "Römorkör", from: new Date(transit), to: new Date(retEnd), source: "OFFICIAL", approved: retEnd < nowMs - 2 * DAY });
        const key = `${t}|${trDate(transit)}`; tugActive.set(key, (tugActive.get(key) ?? 0) + (retEnd - transit) / H);
        let a = transit;
        while (a < retEnd) {
          const d = dutyAt(t, a);
          if (!d) break;
          const next = duty.get(t)!.find((x) => x.start === d.end && x.team !== d.team);
          const segEnd = next ? Math.min(retEnd, d.end) : retEnd;
          for (const row of d.rows) partRows.push({ operationId: opId, personnelId: row.personnelId, assetId: t, roleOnTask: "Römorkör ekibi", from: new Date(a), to: new Date(segEnd), source: "OFFICIAL", approved: retEnd < nowMs - 2 * DAY, note: next && segEnd < retEnd ? "Ekip değişimi — katılım bölündü" : null });
          if (!next && retEnd > d.end) for (const row of d.rows) overtime.push({ row, minutes: Math.round((retEnd - d.end) / MIN), ref });
          a = segEnd;
        }
      }
      if (pilot && !cancel) {
        const pa = svcStart - 40 * MIN, pb = svcEnd + 30 * MIN;
        book(pilot.id, pa, pb);
        partRows.push({ operationId: opId, personnelId: pilot.id, roleOnTask: "Kılavuz kaptan", from: new Date(pa), to: new Date(pb), source: "OFFICIAL", approved: pb < nowMs - 2 * DAY });
        const boat = c.pilotBoats[seq % c.pilotBoats.length];
        partRows.push({ operationId: opId, assetId: boat, roleOnTask: "Kılavuz botu", from: new Date(pa), to: new Date(svcStart), source: "OFFICIAL", approved: true });
        partRows.push({ operationId: opId, assetId: boat, roleOnTask: "Kılavuz botu", from: new Date(svcEnd + 10 * MIN), to: new Date(pb), source: "OFFICIAL", approved: true });
      }
      if (!cancel && (kinds.includes("MOORING") || kinds.includes("UNMOORING"))) {
        partRows.push({ operationId: opId, assetId: c.mooringBoats[seq % c.mooringBoats.length], roleOnTask: "Palamar botu", from: new Date(svcEnd - 25 * MIN), to: new Date(svcEnd + 15 * MIN), source: "OFFICIAL", approved: true });
        costRows.push({ day: trDate(svcEnd), category: "SUBCONTRACT", nature: "ACTUAL", amount: "3200", operationId: opId, description: "ÖRNEK halat elemanı alt yüklenici bedeli", source: "DEMO" });
      }
      if (!cancel && R() < 0.1) costRows.push({ day: trDate(svcEnd), category: "OP_SPECIFIC", nature: "ACTUAL", amount: String(pick([1800, 2400, 4500])), operationId: opId, description: pick(["ÖRNEK kılavuz kaptan kara transferi", "ÖRNEK ek halat/usturmaça kullanımı", "ÖRNEK liman giriş harcı yansıtması"]), source: "DEMO" });

      // Sapmalar (neden ≠ sorumluluk)
      if (wait) devRows.push({ operationId: opId, category: wait[0], minutes: waitMin, note: wait[1], responsibilityNote: wait[2] || null, recordedBy: "seed" });
      if (lateStart) devRows.push({ operationId: opId, category: lateStart[0], minutes: lateMin, note: lateStart[1], recordedBy: "seed" });
      if (tugsNeeded && actualTugs.length < tugsNeeded) devRows.push({ operationId: opId, category: "PLAN_CHANGE", minutes: 0, note: `Planlanan ${tugsNeeded} römorkör yerine ${actualTugs.length} römorkör — o saatte uygun araç yok`, recordedBy: "seed" });
      else if (actualTugs.some((t) => !plannedTugs.includes(t))) devRows.push({ operationId: opId, category: down(plannedTugs[0] ?? "", transit, retEnd) ? "TECH_FAILURE" : "PLAN_CHANGE", minutes: 0, note: `Planlanan römorkör (${plannedTugs.map((t) => tugCode.get(t)).join(", ")}) yerine ${actualTugs.map((t) => tugCode.get(t)).join(", ")} görevlendirildi`, recordedBy: "seed" });
      if (cancel) devRows.push({ operationId: opId, category: "CUSTOMER_PREP", minutes: Math.round((retEnd - transit) / MIN), note: "İş iptal — römorkör ve ekip boşa intikal etti", recordedBy: "seed" });
      if (partial) devRows.push({ operationId: opId, category: "WEATHER", minutes: Math.round(durMin), note: "İş yarıda kaldı", recordedBy: "seed" });

      const end = cancel ? retEnd : svcEnd;
      const completedOld = end < nowMs - 2 * DAY;
      opRows.push({
        ...base,
        requestStatus: "ACCEPTED", approvalStatus: "COMPLETE", planningStatus: "FIRM",
        opStatus: cancel ? "CANCELLED" : partial ? "PARTIAL" : "COMPLETED",
        accrualStatus: cancel && !actualTugs.length ? "AWAITING_CALC" : completedOld ? "APPROVED" : "IN_REVIEW",
        notifyStatus: completedOld ? "SENT" : "READY",
      });
      for (const k of kinds) slRows.push({ operationId: opId, kind: k as "TOWAGE", allocatedUnits: k === "TOWAGE" || k === "STANDBY_TUG" ? tugsNeeded : 1, billableUnits: cancel ? (k === "TOWAGE" ? actualTugs.length : 0) : k === "TOWAGE" || k === "STANDBY_TUG" ? actualTugs.length : 1, status: cancel ? "CANCELLED" : partial ? "PARTIAL" : "COMPLETED", cancelReason: cancel ? "Gemi hazır değil (ÖRNEK)" : null });

      const estCalcId = estimate();
      // Kesin hesap (ÖRNEK tutar — resmî tarife değildir)
      const rate = fx(end);
      const hrs = Math.max(1, Math.ceil(durMin / 60));
      const usd: { kind: string; usd: number }[] = [];
      if (cancel) { if (actualTugs.length) usd.push({ kind: "TOWAGE", usd: actualTugs.length * (700 + 0.03 * gtCap) * 0.5 }); }
      else for (const k of kinds) {
        if (k === "PILOTAGE") usd.push({ kind: k, usd: (type === "OP-007" ? 120 * hrs : 0) + 450 + 0.015 * gtCap });
        if (k === "TOWAGE") usd.push({ kind: k, usd: actualTugs.length * (type === "OP-007" || type === "OP-010" ? 850 * hrs : 700 + 0.03 * gtCap) });
        if (k === "STANDBY_TUG") usd.push({ kind: k, usd: actualTugs.length * 850 * hrs });
        if (k === "MOORING" || k === "UNMOORING") usd.push({ kind: k, usd: 180 + 0.006 * gtCap });
      }
      for (let k = usd.length - 1; k >= 0; k--) if (usd[k].usd <= 0) usd.splice(k, 1);
      if (usd.length) {
        const final = usd.map((u) => ({ kind: u.kind, net: r2(u.usd * rate * (partial ? 0.6 : 1)) }));
        const calcId = createId();
        calcRows.push({ id: calcId, operationId: opId, kind: "FINAL", tariffVersionId: c.tariffVersionId, inputHash: `demo-${ref}`, inputs: { demo: true, note: "ÖRNEK tutar — resmî tarife ve TCMB kuru kullanılmadı", fxDemo: rate, gt: v.gt, tugs: actualTugs.length, hours: hrs, estimateId: estCalcId }, breakdown: { lines: final.map((f, i) => ({ kind: f.kind, usd: r2(usd[i].usd), tryNet: f.net })) }, netAmount: String(r2(final.reduce((a, f) => a + f.net, 0))), currency: "TRY", productionEligible: false, createdAt: new Date(end + 2 * H) });
        completed.push({ opId, ref, end, party: billing, final, calcId });
      }

      function estimate() {
        const rateE = fx(planned), eh = Math.max(1, Math.ceil(estMin / 60));
        let e = 0;
        for (const k of kinds) {
          if (k === "PILOTAGE") e += 450 + 0.015 * gtCap + (type === "OP-007" ? 120 * eh : 0);
          if (k === "TOWAGE") e += tugsNeeded * (type === "OP-007" || type === "OP-010" ? 850 * eh : 700 + 0.03 * gtCap);
          if (k === "STANDBY_TUG") e += 850 * eh;
          if (k === "MOORING" || k === "UNMOORING") e += 180 + 0.006 * gtCap;
        }
        const id = createId();
        calcRows.push({ id, operationId: opId, kind: "ESTIMATE", tariffVersionId: c.tariffVersionId, inputHash: `demo-est-${ref}`, inputs: { demo: true, fxDemo: rateE, gt: v.gt, tugs: tugsNeeded, hours: eh }, breakdown: {}, netAmount: String(r2(e * rateE)), currency: "TRY", productionEligible: false, createdAt: new Date(planned - 6 * H) });
        return id;
      }
    }
  }

  // ── Vardiya gerçekleşenleri: fazla mesai uzatması, onay, eksik kayıt, elle düzeltme ──
  const ext = new Map<ShiftRow, { minutes: number; refs: string[] }>();
  for (const o of overtime) { const e = ext.get(o.row) ?? { minutes: 0, refs: [] }; e.minutes = Math.max(e.minutes, o.minutes); e.refs.push(o.ref); ext.set(o.row, e); }
  const approvedUntil = at("2026-10-19", 0), missingDay = "2026-10-20";
  let missing = 0, corrected = 0;
  for (const r of c.rows) {
    const a = (r.startAt as Date).getTime(), b = (r.endAt as Date).getTime();
    if (b > nowMs) continue;
    const e = ext.get(r);
    if (r.category === "WORK" && trDate(a) === missingDay && missing < 6 && c.rowTeam.has(r) && R() < 0.3) { missing++; continue; } // eksik zaman kaydı
    r.actualStartAt = new Date(a); r.actualEndAt = new Date(b + (e ? e.minutes * MIN : 0)); r.actualSource = "OFFICIAL";
    if (e) r.overtimeReason = `Operasyon vardiya bitişini aştı: ${[...new Set(e.refs)].join(", ")}`;
    if (r.category === "WORK" && corrected < 5 && R() < 0.004) { corrected++; r.actualStartAt = new Date(a + 20 * MIN); r.actualSource = "MANUAL_CORRECTION"; r.correctionReason = "Giriş saati gemi jurnaline göre düzeltildi (ÖRNEK)"; }
    if (b < approvedUntil) { r.approvedById = "seed"; r.approvedAt = new Date(b + 20 * H); }
  }

  // ── Faturalar, iade faturaları, itirazlar, tahsilatlar ──
  const invRows: (typeof s.invoices.$inferInsert)[] = [], lineRows: (typeof s.invoiceLines.$inferInsert)[] = [], payRows: (typeof s.payments.$inferInsert)[] = [], matchRows: (typeof s.paymentMatches.$inferInsert)[] = [];
  const opStatusPatch = new Map<string, "INVOICED" | "RECONCILED">();
  let invSeq = 0;
  const lastIssue = "2026-10-21";
  for (const [i, op] of completed.entries()) {
    const lag = R() < 0.1 ? Math.round(between(15, 26)) : Math.round(between(1, 12));
    const issue = trDate(op.end + lag * DAY);
    if (issue > lastIssue) continue;
    const id = createId(), mult = i % 41 === 7 ? 1.05 : 1; // birkaç faturada tahakkuktan sapma
    const lines = op.final.map((f) => ({ kind: f.kind, net: r2(f.net * mult) }));
    const net = r2(lines.reduce((a, l) => a + l.net, 0)), tax = r2(net * 0.2);
    const disputed = i % 37 === 11 ? r2(net * 0.3) : 0;
    invRows.push({ id, number: `ÖRN2026${String(++invSeq).padStart(6, "0")}`, kind: "INVOICE", partyId: op.party, issueDate: issue, currency: "TRY", netAmount: String(net), taxAmount: String(tax), disputedAmount: String(disputed), disputeNote: disputed ? "Müşteri römorkör sayısına itiraz etti (ÖRNEK)" : null, source: "DEMO" });
    for (const l of lines) lineRows.push({ invoiceId: id, operationId: op.opId, calcResultId: op.calcId, serviceKind: l.kind, description: `${op.ref} · ${l.kind}`, netAmount: String(l.net), taxAmount: String(r2(l.net * 0.2)) });
    opStatusPatch.set(op.opId, "INVOICED");
    // İade faturası: fiyat düzeltmesi (%10) veya tam iade
    let credit = 0;
    if (i % 29 === 5 || i % 53 === 17) {
      const full = i % 53 === 17, cIssue = trDate(op.end + (lag + 6) * DAY);
      if (cIssue <= lastIssue) {
        const cid = createId(), share = full ? 1 : 0.1;
        const cl = lines.map((l) => ({ kind: l.kind, net: -r2(l.net * share) }));
        const cnet = r2(cl.reduce((a, l) => a + l.net, 0));
        credit = -cnet;
        invRows.push({ id: cid, number: `ÖRNIA${String(invSeq).padStart(6, "0")}`, kind: "CREDIT_NOTE", partyId: op.party, issueDate: cIssue, currency: "TRY", netAmount: String(cnet), taxAmount: String(r2(cnet * 0.2)), correctsInvoiceId: id, source: "DEMO" });
        for (const l of cl) lineRows.push({ invoiceId: cid, operationId: op.opId, calcResultId: op.calcId, serviceKind: l.kind, description: `${op.ref} · ${l.kind} · ${full ? "tam iade" : "fiyat düzeltmesi"}`, netAmount: String(l.net), taxAmount: String(r2(l.net * 0.2)) });
      }
    }
    // Tahsilat (brüt, iade düşülerek)
    const due = r2((net - credit) * 1.2 - disputed * 1.2);
    const age = (at(lastIssue, 12) - at(issue, 12)) / DAY;
    if (due > 0 && age >= 12) {
      const u = R();
      const amt = u < 0.72 ? due : u < 0.84 ? r2(due * 0.5) : 0;
      const payDay = trDate(at(issue, 12) + Math.round(between(8, Math.max(9, age))) * DAY);
      if (amt > 0 && payDay <= lastIssue) {
        const pid = createId();
        payRows.push({ id: pid, partyId: op.party, receivedDate: payDay, currency: "TRY", amount: String(amt), reference: `ÖRNEK havale ${invSeq}`, source: "DEMO" });
        matchRows.push({ paymentId: pid, invoiceId: id, amount: String(amt) });
        if (amt === due && !disputed) opStatusPatch.set(op.opId, "RECONCILED");
      }
    }
  }
  // Faturayla eşleşmemiş tahsilat (avans) — hiçbir operasyona/personele yazılmaz
  payRows.push({ partyId: agents[1], receivedDate: "2026-10-14", currency: "TRY", amount: "150000", reference: "ÖRNEK cari hesaba avans — fatura eşleşmesi yok", source: "DEMO" });

  // ── Maliyetler: personel (aylık, hassas), fazla mesai, yakıt, bakım, genel gider ──
  const teams = [...new Set([...c.rowTeam.values()])];
  for (const [month, last, part] of [["2026-09", "2026-09-30", 1], ["2026-10", "2026-10-21", 21 / 31]] as const) {
    for (const t of teams) costRows.push({ day: last, category: "PERSONNEL", nature: part === 1 ? "ACTUAL" : "ESTIMATE", amount: String(r2(4 * 78_000 * part)), teamKey: t, description: `ÖRNEK ${t} ekibi bordro${part === 1 ? "" : " tahakkuku (kısmi ay)"}`, source: "DEMO" });
    costRows.push({ day: last, category: "PERSONNEL", nature: part === 1 ? "ACTUAL" : "ESTIMATE", amount: String(r2(3 * 140_000 * part)), teamKey: "PILOTS", description: "ÖRNEK kılavuz kaptan bordrosu", source: "DEMO" });
    costRows.push({ day: last, category: "OVERHEAD", nature: "ALLOCATED", amount: String(r2(1_150_000 * part)), description: `ÖRNEK genel yönetim gideri ${month}`, allocationBasis: "Römorkör aktif saatleri oranında", source: "DEMO" });
  }
  const otByTeamMonth = new Map<string, number>();
  for (const [row, e] of ext) { const t = c.rowTeam.get(row); if (!t) continue; const k = `${t}|${trDate((row.endAt as Date).getTime()).slice(0, 7)}`; otByTeamMonth.set(k, (otByTeamMonth.get(k) ?? 0) + e.minutes / 60); }
  for (const [k, h] of otByTeamMonth) { const [t, m] = k.split("|"); costRows.push({ day: m === "2026-09" ? "2026-09-30" : "2026-10-21", category: "OVERTIME", nature: "ACTUAL", amount: String(r2(h * 620)), teamKey: t, description: `ÖRNEK fazla mesai ${h.toFixed(1)} kişi-saat × 620 TL`, source: "DEMO" }); }
  const meterRows: (typeof s.assetMeters.$inferInsert)[] = [];
  for (const t of c.tugs) for (const d of days) {
    if (at(d, 0) > nowMs - DAY) continue;
    const active = tugActive.get(`${t.id}|${d}`) ?? 0;
    const onDuty = (duty.get(t.id) ?? []).some((x) => trDate(x.start) === d);
    if (!onDuty && !active) continue;
    const eng = r2(active * 1.05 + (onDuty ? 0.6 : 0));
    const measured = ["R1", "R2", "R3"].includes(t.code);
    const fuel = r2(eng * (measured ? between(132, 158) : 148));
    meterRows.push({ assetId: t.id, day: d, engineHours: String(eng), fuelLiters: String(fuel), fuelMeasured: measured });
    if (fuel > 0) costRows.push({ day: d, category: "FUEL", nature: measured ? "ACTUAL" : "ESTIMATE", amount: String(r2(fuel * 42)), assetId: t.id, description: `ÖRNEK yakıt ${fuel} L × 42 TL${measured ? "" : " (tahmini tüketim)"}`, source: "DEMO" });
  }
  costRows.push({ day: "2026-09-16", category: "MAINTENANCE", nature: "ACTUAL", amount: "240000", assetId: tugByCode.get("R2")!, description: "ÖRNEK periyodik makine bakımı", source: "DEMO" });
  costRows.push({ day: "2026-10-10", category: "MAINTENANCE", nature: "ACTUAL", amount: "185000", assetId: tugByCode.get("R6")!, description: "ÖRNEK yakıt pompası arıza onarımı", source: "DEMO" });

  // ── Yazma ──
  const chunk = async <T,>(rows: T[], f: (x: T[]) => Promise<unknown>) => { for (let i = 0; i < rows.length; i += 400) await f(rows.slice(i, i + 400)); };
  await chunk(pcRows, (x) => db.insert(s.portCalls).values(x));
  await chunk(opRows.map((o) => ({ ...o, accountingStatus: (opStatusPatch.get(o.id!) ?? "AWAITING_EXPORT") as "INVOICED" })), (x) => db.insert(s.operations).values(x));
  await db.update(s.opSeq).set({ last: seq });
  await chunk(slRows, (x) => db.insert(s.serviceLines).values(x));
  await chunk(evRows, (x) => db.insert(s.timelineEvents).values(x));
  await chunk(asgRows, (x) => db.insert(s.assignments).values(x));
  await chunk(partRows, (x) => db.insert(s.participations).values(x));
  await chunk(calcRows, (x) => db.insert(s.calculationResults).values(x));
  await chunk(devRows, (x) => db.insert(s.deviations).values(x));
  await chunk(invRows, (x) => db.insert(s.invoices).values(x));
  await chunk(lineRows, (x) => db.insert(s.invoiceLines).values(x));
  await chunk(payRows, (x) => db.insert(s.payments).values(x));
  await chunk(matchRows, (x) => db.insert(s.paymentMatches).values(x));
  await chunk(costRows, (x) => db.insert(s.costEntries).values(x));
  await chunk(meterRows, (x) => db.insert(s.assetMeters).values(x));
  return { ops: opRows.length, invoices: invRows.length, payments: payRows.length, costs: costRows.length, participations: partRows.length, overtimeRows: ext.size, missing };
}
