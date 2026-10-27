import "server-only";
/**
 * Canlı filo durumu: her aracın son konumu, o anki kaptanı ve görevi.
 * Konum önceliği: son 2 saatteki cihaz (kaptan) konumu → AIS → sunum örneği (yalnız sunum modunda, "ÖRNEK" işaretli).
 * Meşguliyet: şu anı kapsayan görev ataması / fiilî katılım veya aracın atandığı yürüyen operasyon.
 */
import { and, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { ASSET_LABELS, OPERATION_TYPES } from "@/data/catalog";

export const BASE = { lat: 40.6986, lon: 29.4658 }; // Yalova Pilotaj — Altınova Tersaneler Bölgesi
const H = 3_600_000, MIN = 60_000;
const ACTIVE = ["TRANSIT", "ON_SITE", "STARTED", "PAUSED"];
const OPL: Record<string, string> = { READY: "Hazır", TRANSIT: "Hizmet yerine gidiyor", ON_SITE: "Hizmet yerinde", STARTED: "Hizmette", PAUSED: "Bekleme", COMPLETED: "Tamamlandı", PARTIAL: "Kısmen", CANCELLED: "İptal" };

export interface LiveTask { ref: string; vessel: string; gt: number | null; type: string; from: string | null; to: string | null; start: string | null; status: string; statusLabel: string; role: string | null }
export interface LiveAsset {
  id: string; code: string | null; name: string; type: string; typeLabel: string; photoUrl: string | null; illustrative: boolean; available: boolean;
  lat: number; lon: number; at: string; source: "DEVICE" | "AIS" | "DEMO"; accuracyM: number | null; speedKn: number | null; heading: number | null; sharedBy: string | null;
  busy: boolean; captain: string | null; crew: { name: string; role: string }[]; shiftEnd: string | null; onDuty: boolean;
  task: LiveTask | null; next: LiveTask | null;
}
const nm = (x: string | null | undefined) => (x ?? "").replace("ÖRNEK ", "").split(" · ")[0];

/** Sunum modu: römorkörlerin bir kısmını "şu an" işe atar (3 saatte bir tazelenir). Gerçek veriye dokunmaz; yalnız ÖRNEK kayıtlar. */
export async function ensureLiveDemo() {
  if (process.env.DEMO_LOGINS === "0") return;
  const KEY = "demo.live";
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, KEY));
  const st = row?.value as { at: number; asg: string[]; prev: Record<string, { opStatus: string; plannedStart: string | null }> } | undefined;
  if (st && Date.now() - st.at < 3 * H) return;
  // önceki örneği geri al
  if (st) {
    if (st.asg.length) await db.delete(s.assignments).where(inArray(s.assignments.id, st.asg));
    for (const [id, p] of Object.entries(st.prev)) await db.update(s.operations).set({ opStatus: p.opStatus as "READY", plannedStart: p.plannedStart ? new Date(p.plannedStart) : null }).where(eq(s.operations.id, id));
  }
  const now = Date.now();
  const onShift = await db.select({ a: s.fleetAssets, p: s.personnel }).from(s.shifts).innerJoin(s.fleetAssets, eq(s.fleetAssets.id, s.shifts.assetId)).innerJoin(s.personnel, eq(s.personnel.id, s.shifts.personnelId))
    .where(and(eq(s.shifts.category, "WORK"), lte(s.shifts.startAt, new Date(now)), gt(s.shifts.endAt, new Date(now)), eq(s.fleetAssets.type, "TUG")));
  const tugs = [...new Map(onShift.map((x) => [x.a.id, x])).values()].sort((x, y) => (x.a.code ?? "").localeCompare(y.a.code ?? "", "tr", { numeric: true }));
  const captainOf = (assetId: string) => onShift.find((x) => x.a.id === assetId && x.p.crewRole === "KAPTAN")?.p.id ?? null;
  const towTypes = OPERATION_TYPES.filter((t) => t.kinds.includes("TOWAGE")).map((t) => t.code);
  const cands = await db.select().from(s.operations).where(and(eq(s.operations.isDemo, true), inArray(s.operations.typeCode, towTypes), inArray(s.operations.opStatus, ["READY", "COMPLETED"]))).orderBy(desc(s.operations.plannedStart)).limit(40);
  const pick = cands.filter((o) => o.toFacilityId || o.fromFacilityId).slice(0, 3);
  const [pilotBoat] = await db.select().from(s.fleetAssets).where(eq(s.fleetAssets.type, "PILOT_BOAT")).orderBy(s.fleetAssets.name).limit(1);
  const plan: { status: string; start: number; tugs: number }[] = [{ status: "STARTED", start: now - 35 * MIN, tugs: 2 }, { status: "TRANSIT", start: now + 15 * MIN, tugs: 1 }, { status: "READY", start: now + 80 * MIN, tugs: 1 }];
  const asg: string[] = [], prev: Record<string, { opStatus: string; plannedStart: string | null }> = {};
  let ti = 0;
  for (let i = 0; i < pick.length && ti < tugs.length; i++) {
    const o = pick[i], p = plan[i];
    prev[o.id] = { opStatus: o.opStatus, plannedStart: o.plannedStart?.toISOString() ?? null };
    await db.update(s.operations).set({ opStatus: p.status as "READY", plannedStart: new Date(p.start) }).where(eq(s.operations.id, o.id));
    for (let k = 0; k < p.tugs && ti < tugs.length; k++, ti++) {
      const t = tugs[ti];
      const [a] = await db.insert(s.assignments).values({ operationId: o.id, assetId: t.a.id, personnelId: captainOf(t.a.id), roleOnTask: "Römorkör", from: new Date(p.start - 20 * MIN), to: new Date(p.start + 100 * MIN), firm: true }).returning({ id: s.assignments.id });
      asg.push(a.id);
    }
    if (i === 0 && pilotBoat) { const [a] = await db.insert(s.assignments).values({ operationId: o.id, assetId: pilotBoat.id, roleOnTask: "Kılavuz botu", from: new Date(p.start - 30 * MIN), to: new Date(p.start + 60 * MIN), firm: true }).returning({ id: s.assignments.id }); asg.push(a.id); }
  }
  const value = { at: now, asg, prev };
  await db.insert(s.appSettings).values({ key: KEY, value, updatedBy: "sunum" }).onConflictDoUpdate({ target: s.appSettings.key, set: { value, updatedAt: new Date() } });
}

/** Örnek konumlar için haritada denizde kaldığı doğrulanmış noktalar (OSM üzerinde kontrol edildi, 27.10.2026) */
const IDLE_WATER: [number, number][] = [[40.710699, 29.463555], [40.709399, 29.461409], [40.708098, 29.459263], [40.707448, 29.462267], [40.706147, 29.460121], [40.704847, 29.457976], [40.712, 29.464413], [40.707448, 29.457117], [40.705822, 29.455401], [40.713301, 29.462696], [40.711675, 29.460551], [40.710049, 29.458405]];
const BERTH_WATER: [string, [number, number][]][] = [
  ["Yalova Pilotaj", [[40.702246, 29.455401], [40.703546, 29.453684], [40.703871, 29.457117]]],
  ["Altınova Gemi", [[40.708749, 29.464842], [40.707773, 29.463555], [40.710049, 29.4657]]],
  ["Hersek", [[40.725461, 29.48218], [40.726632, 29.483725], [40.727932, 29.485441]]],
  ["Marmara Yat", [[40.728258, 29.49102], [40.729428, 29.492565], [40.730664, 29.494196]]],
  ["Tersane Rıhtımı", [[40.699644, 29.450251], [40.698344, 29.447676], [40.700945, 29.451968]]],
  ["demir", [[40.738142, 29.472138], [40.736711, 29.475142], [40.736386, 29.469134]]],
];
/** Tesisin önündeki deniz noktası; bilinmeyen tesiste kıyıdan kuzeye kaydırır */
const toWater = (name: string, lat: number, lon: number, k = 0) => {
  const hit = BERTH_WATER.find(([n]) => name.includes(n));
  if (hit) { const [la, lo] = hit[1][k % hit[1].length]; return { lat: la, lon: lo }; }
  return { lat: lat + 0.006, lon };
};

export async function getLiveFleet(): Promise<{ assets: LiveAsset[]; base: typeof BASE; generatedAt: string; demo: boolean }> {
  await ensureLiveDemo().catch(() => undefined);
  const now = Date.now(), nowD = new Date(now);
  const assets = (await db.select().from(s.fleetAssets).orderBy(s.fleetAssets.type, s.fleetAssets.name)).filter((a) => a.type !== "LAND_VEHICLE" && a.type !== "EQUIPMENT");
  const ids = assets.map((a) => a.id);
  // son konum (araç başına en yeni)
  const pos = ids.length ? (await db.execute(sql`SELECT DISTINCT ON (asset_id) p.*, u.name AS user_name FROM asset_positions p LEFT JOIN users u ON u.id = p.user_id WHERE p.asset_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) ORDER BY asset_id, at DESC`)).rows as { asset_id: string; lat: string; lon: string; accuracy_m: number | null; speed_kn: string | null; heading: number | null; source: string; at: Date; user_name: string | null }[] : [];
  // vardiya ve görevler
  const shifts = await db.select({ sh: s.shifts, p: s.personnel }).from(s.shifts).innerJoin(s.personnel, eq(s.personnel.id, s.shifts.personnelId)).where(and(eq(s.shifts.category, "WORK"), lte(s.shifts.startAt, nowD), gt(s.shifts.endAt, nowD)));
  const win = (t: typeof s.assignments | typeof s.participations) => and(lte(t.from, new Date(now + 6 * H)), gte(t.to, new Date(now - 2 * H)));
  const asg = await db.select().from(s.assignments).where(win(s.assignments));
  const part = await db.select().from(s.participations).where(win(s.participations));
  const links = [...asg, ...part].filter((x) => x.assetId);
  const opIds = [...new Set(links.map((x) => x.operationId))];
  const ops = opIds.length ? await db.select({ op: s.operations, vessel: s.vessels.name, gt: s.vessels.gt }).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId)).where(inArray(s.operations.id, opIds)) : [];
  const facs = await db.select().from(s.facilities);
  const fac = (id: string | null) => facs.find((f) => f.id === id);
  const people = await db.select({ id: s.personnel.id, n: s.personnel.fullName }).from(s.personnel);
  const taskOf = (l: (typeof links)[number]): LiveTask | null => {
    const o = ops.find((x) => x.op.id === l.operationId); if (!o) return null;
    return { ref: o.op.ref, vessel: o.vessel, gt: o.gt ? Number(o.gt) : null, type: OPERATION_TYPES.find((t) => t.code === o.op.typeCode)?.nameTr ?? o.op.typeCode, from: fac(o.op.fromFacilityId)?.name.replace("ÖRNEK ", "") ?? null, to: fac(o.op.toFacilityId)?.name.replace("ÖRNEK ", "") ?? null, start: o.op.plannedStart?.toISOString() ?? null, status: o.op.opStatus, statusLabel: OPL[o.op.opStatus] ?? o.op.opStatus, role: l.roleOnTask };
  };
  let demo = false;
  const out: LiveAsset[] = assets.map((a, idx) => {
    const mine = links.filter((l) => l.assetId === a.id);
    const current = mine.find((l) => { const o = ops.find((x) => x.op.id === l.operationId); return o && !["CANCELLED", "COMPLETED", "PARTIAL"].includes(o.op.opStatus) && (ACTIVE.includes(o.op.opStatus) || (l.from.getTime() <= now && l.to.getTime() > now)); });
    const upcoming = mine.filter((l) => l !== current && l.from.getTime() > now).sort((x, y) => x.from.getTime() - y.from.getTime())[0];
    const task = current ? taskOf(current) : null;
    const crewSh = shifts.filter((x) => x.sh.assetId === a.id);
    const cap = crewSh.find((x) => x.p.crewRole === "KAPTAN")?.p ?? (current?.personnelId ? { fullName: people.find((p) => p.id === current.personnelId)?.n ?? "" } : null);
    const p = pos.find((x) => x.asset_id === a.id);
    const fresh = p && now - new Date(p.at).getTime() < 2 * H;
    let lat: number, lon: number, source: LiveAsset["source"], at: string;
    if (fresh) { lat = Number(p.lat); lon = Number(p.lon); source = p.source === "AIS" ? "AIS" : "DEVICE"; at = new Date(p.at).toISOString(); }
    else {
      demo = true; source = "DEMO"; at = nowD.toISOString();
      const o = current ? ops.find((x) => x.op.id === current.operationId) : null;
      const f = o ? fac(o.op.toFacilityId) ?? fac(o.op.fromFacilityId) : null;
      const target = f?.lat ? toWater(f.name, Number(f.lat), Number(f.lon), idx) : null;
      const [hl, hn] = IDLE_WATER[idx % IDLE_WATER.length]; const home = { lat: hl, lon: hn };
      const wob = Math.sin(now / 90_000 + idx) * 0.00025;
      if (o && target && o.op.opStatus === "TRANSIT") { const k = ((now / MIN) % 30) / 30; lat = home.lat + (target.lat - home.lat) * k; lon = home.lon + (target.lon - home.lon) * k; }
      else if (o && target) { lat = target.lat + wob; lon = target.lon + Math.cos(now / 90_000 + idx) * 0.0003; }
      else { lat = home.lat; lon = home.lon; }
    }
    return {
      id: a.id, code: a.code, name: a.name, type: a.type, typeLabel: ASSET_LABELS[a.type] ?? a.type, photoUrl: a.photoUrl, illustrative: a.photoIllustrative, available: a.available,
      lat, lon, at, source, accuracyM: fresh ? p.accuracy_m : null, speedKn: fresh && p.speed_kn ? Number(p.speed_kn) : null, heading: fresh ? p.heading : null, sharedBy: fresh ? p.user_name : null,
      busy: !!task, captain: cap ? nm(cap.fullName) : fresh ? p.user_name : null,
      crew: crewSh.filter((x) => x.p.crewRole !== "KAPTAN").map((x) => ({ name: nm(x.p.fullName), role: x.p.title })), shiftEnd: crewSh[0]?.sh.endAt.toISOString() ?? null, onDuty: crewSh.length > 0,
      task, next: upcoming ? taskOf(upcoming) : null,
    };
  });
  return { assets: out, base: BASE, generatedAt: nowD.toISOString(), demo };
}
