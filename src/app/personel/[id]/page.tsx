import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage } from "@/lib/session";
import { personIntervals, certIssues, labelOf } from "@/lib/planning/service";
import { evaluate } from "@/lib/planning/rest";
import { profileByCode } from "@/lib/planning/profiles";
import { fmtDT } from "@/lib/format";
import { Term } from "@/components/Term";
import { CancelShift } from "./cancel";

export const metadata = { title: "Personel" };
const DAY = 86_400_000, TZ = 3 * 3600_000;
const hm = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`);
const ymd = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10);
const tm = (ms: number) => new Date(ms + TZ).toISOString().slice(11, 16);

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInternalPage();
  const { id } = await params;
  const [p] = await db.select().from(s.personnel).where(eq(s.personnel.id, id));
  if (!p) notFound();
  const prof = profileByCode(p.workProfile);
  const today = new Date(Date.now() + TZ); today.setUTCHours(0, 0, 0, 0);
  const to = today.getTime() - TZ + 4 * DAY, from = to - 14 * DAY;
  const ivs = await personIntervals(p.id, from, to);
  const ev = evaluate(ivs, prof, from, to);
  const certs = await db.select().from(s.certificates).where(eq(s.certificates.personnelId, p.id));
  const certIss = await certIssues(p.id, Date.now());
  const shiftRows = await db.select({ x: s.shifts, ref: s.operations.ref }).from(s.shifts).leftJoin(s.operations, eq(s.operations.id, s.shifts.operationId))
    .where(and(eq(s.shifts.personnelId, p.id), gte(s.shifts.endAt, new Date(from)))).orderBy(desc(s.shifts.startAt));
  const asset = p.homeAssetId ? (await db.select().from(s.fleetAssets).where(eq(s.fleetAssets.id, p.homeAssetId)))[0] : null;
  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - from) / (to - from)) * 100));
  const COLORS: Record<string, string> = { WORK: "var(--navy-700)", STANDBY: "#c98a00", TRAINING: "#0f7c7a", LEAVE: "#9aa3b5" };

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="muted" style={{ fontSize: 12 }}><Link href="/personel">Personel</Link> / <Link href="/planlama">Planlama</Link></div>
          <h1>{p.fullName} {p.isDemo && <span className="badge demo">ÖRNEK</span>}</h1>
          <div className="muted">{p.title} · {p.unit}{asset ? ` · ${asset.name}` : ""} · Profil: <b>{prof.name}</b></div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="v">{hm(ev.metrics.workMinutes).replace(" dk", "")}</div><div className="l">Son 14 gün çalışma</div></div>
        <div className="card kpi"><div className="v">{ev.metrics.nightShifts}</div><div className="l"><Term n={35}>Gece görevi</Term> ({hm(ev.metrics.nightMinutes)})</div></div>
        <div className="card kpi"><div className="v" style={{ color: prof.minRest24h && (ev.metrics.minRest24h ?? 9e9) < prof.minRest24h ? "var(--bad)" : undefined }}>{hm(ev.metrics.minRest24h)}</div><div className="l">En düşük 24 saat <Term n={34}>dinlenme</Term>{prof.minRest24h ? ` (en az ${prof.minRest24h / 60} sa)` : ""}</div></div>
        <div className="card kpi"><div className="v" style={{ color: prof.minRest7d && (ev.metrics.minRest7d ?? 9e9) < prof.minRest7d ? "var(--bad)" : undefined }}>{hm(ev.metrics.minRest7d)}</div><div className="l">En düşük 7 gün dinlenme{prof.minRest7d ? ` (en az ${prof.minRest7d / 60} sa)` : ""}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>14 günlük çizelge</h2>
        <div style={{ position: "relative", height: 46, border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)" }}>
          {[...Array(14)].map((_, i) => <div key={i} style={{ position: "absolute", left: `${(i / 14) * 100}%`, top: 0, bottom: 0, borderLeft: i ? "1px solid #e3e7ef" : "none", fontSize: 9.5, color: "var(--muted)", paddingLeft: 3 }}>{ymd(from + i * DAY).slice(8)}.{ymd(from + i * DAY).slice(5, 7)}</div>)}
          {[...Array(15)].map((_, i) => { const ns = from + (i - 1) * DAY + 20 * 3600_000; return <div key={`n${i}`} style={{ position: "absolute", left: `${pct(ns)}%`, width: `${pct(ns + 10 * 3600_000) - pct(ns)}%`, top: 14, bottom: 0, background: "repeating-linear-gradient(135deg,#e6e9f3 0 3px,transparent 3px 6px)" }} />; })}
          {ivs.filter((x) => x.end > from && x.start < to).map((x, i) => <div key={i} title={`${x.label} ${ymd(x.start)} ${tm(x.start)}–${tm(x.end)}`} style={{ position: "absolute", left: `${pct(x.start)}%`, width: `${Math.max(0.3, pct(x.end) - pct(x.start))}%`, top: 18, height: 18, borderRadius: 3, background: COLORS[x.category] }} />)}
          {ev.violations.filter((v) => v.severity === "ERROR" && v.windowStart).map((v, i) => <div key={`v${i}`} title={v.message} style={{ position: "absolute", left: `${pct(v.windowStart!)}%`, width: `${Math.max(0.4, pct(v.windowEnd!) - pct(v.windowStart!))}%`, bottom: 2, height: 4, background: "var(--bad)" }} />)}
          <div style={{ position: "absolute", left: `${pct(Date.now())}%`, top: 0, bottom: 0, width: 2, background: "var(--orange)" }} />
        </div>
        <div className="sep" />
        <div className="grid g2">
          <div>
            <h3>Kural değerlendirmesi</h3>
            {ev.violations.length === 0 && <div className="alert ok"><span>✓</span><div>Son 14 günde ihlal yok.</div></div>}
            <ul style={{ paddingLeft: 18, fontSize: 12.5, margin: 0 }}>{ev.violations.map((v, i) => <li key={i} style={{ color: v.severity === "ERROR" ? "var(--bad)" : "var(--warn)" }}>{v.message}</li>)}</ul>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Dayanak: {prof.basis}. {prof.note}</div>
          </div>
          <div>
            <h3>Haftalık çalışma</h3>
            <table><tbody>{ev.metrics.weekly.map((w) => <tr key={w.weekStart}><td>{w.weekStart} haftası</td><td className="mono">{hm(w.workMinutes)}</td><td>{w.overtimeMinutes > 0 ? <span className="badge warn">+{hm(w.overtimeMinutes)} fazla mesai</span> : <span className="badge ok">normal</span>}</td></tr>)}</tbody></table>
            <div className="muted" style={{ fontSize: 11.5 }}>En uzun kesintisiz çalışma: {hm(ev.metrics.longestContinuousWork)} · Hazır bulunma: {hm(ev.metrics.standbyMinutes)}</div>
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Kayıtlar</h2>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table><thead><tr><th>Başlangıç</th><th>Bitiş</th><th>Tür</th><th>Not</th><th>Durum</th><th /></tr></thead><tbody>
              {shiftRows.map(({ x, ref }) => (
                <tr key={x.id} style={x.status === "CANCELLED" ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
                  <td style={{ fontSize: 12 }}>{fmtDT(x.startAt)}</td><td style={{ fontSize: 12 }}>{fmtDT(x.endAt)}</td><td>{labelOf(x.category)}</td>
                  <td style={{ fontSize: 12 }}>{x.note ?? ""}{ref ? ` · ${ref}` : ""}{x.exception ? <div><span className="badge bad">Acil istisna</span></div> : null}</td>
                  <td><span className={`badge ${x.status === "CONFIRMED" ? "ok" : x.status === "CANCELLED" ? "grey" : ""}`}>{x.status === "CONFIRMED" ? "Gerçekleşti" : x.status === "CANCELLED" ? "İptal" : "Planlı"}</span></td>
                  <td>{x.status === "PLANNED" && <CancelShift id={x.id} />}</td>
                </tr>))}
            </tbody></table>
          </div>
        </div>
        <div className="card">
          <h2>Yeterlik ve belgeler</h2>
          <table><thead><tr><th>Belge</th><th>No</th><th>Geçerlilik</th></tr></thead><tbody>
            {certs.map((c) => { const expired = c.expiresAt && c.expiresAt.getTime() < Date.now(); const soon = c.expiresAt && c.expiresAt.getTime() < Date.now() + 30 * DAY;
              return <tr key={c.id}><td>{c.name}</td><td className="mono">{c.number}</td><td><span className={`badge ${expired ? "bad" : soon ? "warn" : "ok"}`}>{c.expiresAt ? c.expiresAt.toLocaleDateString("tr-TR") : "—"}{expired ? " · süresi dolmuş" : soon ? " · yakında" : ""}</span></td></tr>; })}
          </tbody></table>
          {certIss.some((c) => c.severity === "ERROR") && <div className="alert bad" style={{ marginTop: 8 }}><span>⚠</span><div>Süresi dolmuş belge varken göreve atanamaz (planlama kontrolü engeller).</div></div>}
          <div className="sep" />
          <div className="alert info"><span>🔒</span><div>Sağlık verileri (kan grubu vb.) bu ekranda gösterilmez; yalnız yetkili rollerle ve erişim kaydıyla görüntülenir (R-017).</div></div>
        </div>
      </div>
    </>
  );
}
