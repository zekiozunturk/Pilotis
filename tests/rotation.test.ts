import { describe, it, expect } from "vitest";
import { DEFAULT_ROTATION, staffing, simulate, coverage, scenarios, teamsOf, teamDuty, teamsPerTug, validateModel, type RotationModel } from "@/lib/planning/rotation";
import { profileByCode } from "@/lib/planning/profiles";

const P = profileByCode("STCW_MLC");
const m0: RotationModel = DEFAULT_ROTATION;

describe("Rotasyon — kadro hesabı", () => {
  it("7 römorkör · 4 kişi · 7/7 → römorkör başına 2 ekip, 14 ekip, 56 kişi + %10 yedek (6) = 62", () => {
    const s = staffing(m0);
    expect(s).toMatchObject({ cycle: 14, teamsPerTug: 2, teams: 14, crew: 56, reserve: 6, total: 62, dayTugs: 5, nightTugs: 2 });
  });
  it("7/14 düzeni 3 ekip, 14/7 düzeni 2 ekip ister (⌈döngü/görev⌉)", () => {
    expect(teamsPerTug({ ...m0, onDays: 7, offDays: 14 })).toBe(3);
    expect(teamsPerTug({ ...m0, onDays: 14, offDays: 7 })).toBe(2);
  });
  it("model doğrulama hatalı değerleri yakalar", () => {
    expect(validateModel(m0)).toEqual([]);
    expect(validateModel({ ...m0, onDays: 0, day: { start: "25:00", hours: 14 } }).length).toBe(2);
  });
});

describe("Rotasyon — kapsama", () => {
  it("varsayılan düzende hiç boşluk yok; gündüz 5, gece 2, çakışan 18–21 saatlerinde 7 römorkör", () => {
    const c = coverage(m0);
    expect(c.gaps).toBe(0);
    expect(c.hours[10]).toMatchObject({ min: 5, max: 5, expected: 5 });
    expect(c.hours[2]).toMatchObject({ min: 2, max: 2, expected: 2 });
    expect(c.hours[19]).toMatchObject({ min: 7, expected: 7 });
  });
  it("gece rotasyonu açıkken her gün tam 2 ekip gece görevinde", () => {
    const m = { ...m0, nightRotation: true };
    const teams = teamsOf(m);
    for (let d = 0; d < 42; d++) expect(teams.filter((t) => teamDuty(m, t, d) === "NIGHT").length).toBe(2);
    // her römorkör ekibi zamanla gece görevi alır
    const nightTeams = new Set(teams.filter((t) => Array.from({ length: 98 }, (_, d) => teamDuty(m, t, d)).includes("NIGHT")).map((t) => t.key));
    expect(nightTeams.size).toBe(14);
  });
});

describe("Rotasyon — dinlenme ölçümü ve sağlık", () => {
  const sim = simulate(m0, P);
  it("7 gün × 14 saat: 7 günde 98 sa çalışma → 70 sa dinlenme < 77 sa (STCW) — tüm ekiplerde ihlal", () => {
    expect(sim.system.worst7).toBe(70 * 60);
    expect(sim.system.worst24).toBe(10 * 60);
    expect(sim.system.peopleWithErrors).toBe(56);
    for (const t of sim.teams) expect(t.m.errors.some((v) => v.code === "REST_7D")).toBe(true);
  });
  it("7 ardışık görev günü 854 sınırını (6) aşar → uyarı; haftalık 98 sa → 50 sa fazla mesai", () => {
    const t = sim.teams.find((x) => x.mode === "Gündüz")!;
    expect(t.m.maxConsecutiveDays).toBe(7);
    expect(t.m.warnings.some((v) => v.code === "CONSECUTIVE_DAYS")).toBe(true);
    expect(t.m.maxWeekHours).toBe(98);
    expect(t.m.avgWeeklyHours).toBe(49);
  });
  it("ihlal varken sistem 'Riskli' (≤69)", () => {
    expect(sim.system.score).toBeLessThanOrEqual(69);
    expect(sim.system.band).toBe("RISK");
  });
  it("6/6 × 14 sa: 7 günde en çok 84 sa çalışma → 84 sa dinlenme ≥ 77; 6 gün sınırı içinde → sağlıklı", () => {
    const s = simulate({ ...m0, onDays: 6, offDays: 6 }, P);
    expect(s.system.peopleWithErrors).toBe(0);
    expect(s.system.worst7).toBe(84 * 60);
    expect(s.system.band).toBe("OK");
    expect(s.staffing.total).toBe(62);
  });
  it("7/7 × 13 sa: 91 sa çalışma → tam 77 sa dinlenme (ihlal yok) ama 7 ardışık gün → en fazla 'Dikkat'", () => {
    const s = simulate({ ...m0, day: { ...m0.day, hours: 13 }, night: { ...m0.night, hours: 13 } }, P);
    expect(s.system.peopleWithErrors).toBe(0);
    expect(s.system.worst7).toBe(77 * 60);
    expect(s.system.score).toBeLessThanOrEqual(84);
  });
  it("senaryolar mevcut modelden türetilir ve ilki mevcut modeldir", () => {
    const sc = scenarios(m0);
    expect(sc[0].key).toBe("current");
    expect(sc.map((x) => x.key)).toEqual(["current", "h13", "h12", "d6", "t3"]);
  });
});
