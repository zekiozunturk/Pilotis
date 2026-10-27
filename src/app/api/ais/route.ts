import { currentScope } from "@/lib/session";
export const dynamic = "force-dynamic";
/**
 * Ücretsiz AIS akışı (aisstream.io) — AISSTREAM_API_KEY tanımlıysa bölgedeki gemileri birkaç saniye dinleyip 60 sn önbellekler.
 * Anahtar sunucuda kalır, tarayıcıya gönderilmez.
 */
type Ship = { mmsi: number; name: string; lat: number; lon: number; sog: number | null; cog: number | null; heading: number | null; type: number | null; dest: string | null; at: string };
let cache: { at: number; ships: Ship[]; bbox: string } | null = null;
export async function GET(req: Request) {
  const scope = await currentScope();
  if (scope.external) return new Response("Bulunamadı", { status: 404 });
  const key = process.env.AISSTREAM_API_KEY;
  if (!key) return Response.json({ configured: false, ships: [] });
  const u = new URL(req.url);
  const bbox = [[Number(u.searchParams.get("s") ?? 40.62), Number(u.searchParams.get("w") ?? 29.25)], [Number(u.searchParams.get("n") ?? 40.80), Number(u.searchParams.get("e") ?? 29.95)]];
  const bk = JSON.stringify(bbox);
  if (cache && cache.bbox === bk && Date.now() - cache.at < 60_000) return Response.json({ configured: true, cached: true, ships: cache.ships });
  const ships = new Map<number, Ship>();
  await new Promise<void>((resolve) => {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    const done = setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [bbox], FilterMessageTypes: ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"] }));
    ws.onerror = () => { clearTimeout(done); resolve(); };
    ws.onmessage = async (ev) => {
      try {
        const txt = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
        const m = JSON.parse(txt); const md = m.MetaData ?? {};
        const mmsi = Number(md.MMSI); if (!mmsi) return;
        const cur = ships.get(mmsi) ?? { mmsi, name: String(md.ShipName ?? "").trim(), lat: md.latitude, lon: md.longitude, sog: null, cog: null, heading: null, type: null, dest: null, at: md.time_utc ?? new Date().toISOString() };
        const pr = m.Message?.PositionReport ?? m.Message?.StandardClassBPositionReport;
        if (pr) Object.assign(cur, { lat: pr.Latitude, lon: pr.Longitude, sog: pr.Sog ?? null, cog: pr.Cog ?? null, heading: pr.TrueHeading === 511 ? null : pr.TrueHeading ?? null });
        const sd = m.Message?.ShipStaticData;
        if (sd) Object.assign(cur, { name: String(sd.Name ?? cur.name).trim(), type: sd.Type ?? null, dest: String(sd.Destination ?? "").trim() || null });
        ships.set(mmsi, cur);
      } catch { /* bozuk ileti atlanır */ }
    };
  });
  cache = { at: Date.now(), ships: [...ships.values()].filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)), bbox: bk };
  return Response.json({ configured: true, cached: false, ships: cache.ships });
}
