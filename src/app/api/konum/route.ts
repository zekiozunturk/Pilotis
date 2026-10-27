import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentRole, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const FIELD = ["PILOT", "TUG_MASTER", "CREW", "SHORE_OPS"];
/** Kaptanın cihazından konum: yalnız kendi vardiyasındaki araç (kılavuz kaptan: kılavuz/palamar botları); en sık 10 saniyede bir */
export async function POST(req: Request) {
  const u = await requireUser();
  const role = await currentRole();
  if (!FIELD.includes(role) && role !== "SYSTEM_ADMIN") return Response.json({ ok: false, message: "Konum yalnız saha personelinden alınır" }, { status: 403 });
  let b: { assetId?: string; lat?: number; lon?: number; accuracy?: number; speed?: number | null; heading?: number | null };
  try { b = await req.json(); } catch { return Response.json({ ok: false, message: "Geçersiz istek" }, { status: 400 }); }
  const lat = Number(b.lat), lon = Number(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return Response.json({ ok: false, message: "Geçersiz koordinat" }, { status: 400 });
  const [asset] = await db.select().from(s.fleetAssets).where(eq(s.fleetAssets.id, String(b.assetId ?? "")));
  if (!asset) return Response.json({ ok: false, message: "Araç seçin" }, { status: 400 });
  // Yetki: kendi vardiyasındaki araç; kılavuz kaptan ve kıyı operasyon botları seçebilir
  const now = new Date();
  const mine = u.personnelId ? await db.select().from(s.shifts).where(and(eq(s.shifts.personnelId, u.personnelId), eq(s.shifts.assetId, asset.id), lte(s.shifts.startAt, new Date(now.getTime() + 3_600_000)), gt(s.shifts.endAt, new Date(now.getTime() - 3_600_000)))) : [];
  const boat = ["PILOT_BOAT", "MOORING_BOAT", "SURFACE_CLEANING_VESSEL"].includes(asset.type) && ["PILOT", "SHORE_OPS"].includes(role);
  if (!mine.length && !boat && role !== "SYSTEM_ADMIN") return Response.json({ ok: false, message: `${asset.name} için şu an vardiyanız yok — konum yalnız görevdeki araç için paylaşılır` }, { status: 403 });
  const [last] = await db.select().from(s.assetPositions).where(and(eq(s.assetPositions.assetId, asset.id), eq(s.assetPositions.userId, u.id))).orderBy(desc(s.assetPositions.at)).limit(1);
  if (last && now.getTime() - last.at.getTime() < 10_000) return Response.json({ ok: true, message: "Çok sık — atlandı", at: last.at.toISOString(), skipped: true });
  const kn = b.speed != null && Number.isFinite(Number(b.speed)) ? Math.round(Number(b.speed) * 1.943844 * 10) / 10 : null; // m/s → knot
  await db.insert(s.assetPositions).values({ assetId: asset.id, lat: lat.toFixed(6), lon: lon.toFixed(6), accuracyM: b.accuracy != null ? Math.round(Number(b.accuracy)) : null, speedKn: kn == null ? null : String(kn), heading: b.heading != null && Number.isFinite(Number(b.heading)) ? Math.round(Number(b.heading)) : null, source: "DEVICE", userId: u.id, personnelId: u.personnelId });
  return Response.json({ ok: true, message: `${asset.name} konumu iletildi`, at: now.toISOString() });
}
