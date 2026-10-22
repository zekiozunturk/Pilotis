import Link from "next/link";
import { asc, inArray, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage } from "@/lib/session";
import { weekBoard, exceptionsThisMonth, EXCEPTION_MONTHLY_LIMIT } from "@/lib/planning/service";
import { profileByCode, PROFILES } from "@/lib/planning/profiles";
import { Term } from "@/components/Term";
import { ShiftForm, CrewSuggest } from "./forms";

export const metadata = { title: "Planlama" };
const DAY = 86_400_000, TZ = 3 * 3600_000;
const DOW = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const hm = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`);
const COLORS: Record<string, string> = { WORK: "var(--navy-700)", NIGHT: "var(--plan-night)", STANDBY: "var(--plan-training)", TRAINING: "var(--plan-standby)", LEAVE: "var(--plan-leave)" };

function mondayOf(ms: number) { const d = new Date(ms + TZ); d.setUTCHours(0, 0, 0, 0); const dow = (d.getUTCDay() + 6) % 7; return d.getTime() - TZ - dow * DAY; }
const ymd = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10);
const tm = (ms: number) => new Date(ms + TZ).toISOString().slice(11, 16);

export default async function Planning({ searchParams }: { searchParams: Promise<{ hafta?: string; tumu?: string }> }) {
  await requireInternalPage();
  const sp = await searchParams;
  const ws = sp.hafta ? mondayOf(new Date(`${sp.hafta}T12:00:00+03:00`).getTime()) : mondayOf(Date.now());
  const we = ws + 7 * DAY;
  const fullBoard = await weekBoard(ws);
  const showAll = sp.tumu === "1";
  // Varsayılan: bu hafta kaydı olan veya kural/belge sorunu olan kişiler (izin haftasındaki ekipler gizlenir)
  const board = showAll ? fullBoard : fullBoard.filter((b) => b.intervals.length > 0);
  const hidden = fullBoard.length - board.length;
  const exUsed = await exceptionsThisMonth();
  const assets = await db.select().from(s.fleetAssets).orderBy(asc(s.fleetAssets.name));
  const ops = await db.select({ ref: s.operations.ref, plannedStart: s.operations.plannedStart, vessel: s.vessels.name }).from(s.operations)
    .innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .where(inArray(s.operations.opStatus, ["READY", "TRANSIT", "ON_SITE"]));
  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - ws) / (7 * DAY)) * 100));
  const now = Date.now();
  const errPeople = board.filter((b) => b.evaluation.violations.some((v) => v.severity === "ERROR") || b.certs.some((c) => c.severity === "ERROR"));
  const totNightShifts = board.reduce((a, b) => a + b.evaluation.metrics.nightShifts, 0);
  const totOvertime = board.reduce((a, b) => a + b.evaluation.metrics.weekly.reduce((x, w) => x + w.overtimeMinutes, 0), 0);
  const groups = [...new Set(board.map((b) => b.person.unit ?? "Diğer"))];
  const maxNight = Math.max(1, ...board.map((b) => b.evaluation.metrics.nightShifts));
  const maxHours = Math.max(1, ...board.map((b) => b.evaluation.metrics.workMinutes));

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Planlama — vardiya, <Term n={35}>gece çalışması</Term> ve <Term n={34}>dinlenme</Term></h1>
          <div className="muted">Kurallar takvim günü toplamıyla değil, kayan 24 saat ve 7 günlük pencerelerle denetlenir. Hafta: {ymd(ws)} – {ymd(we - DAY)}</div>
        </div>
        <div className="toolbar">
          <Link className="btn secondary" href={`/planlama?hafta=${ymd(ws - 7 * DAY)}`}>← Önceki hafta</Link>
          <Link className="btn secondary" href="/planlama">Bu hafta</Link>
          <Link className="btn secondary" href={`/planlama?hafta=${ymd(ws + 7 * DAY)}`}>Sonraki hafta →</Link>
          <Link className="btn secondary" href={`/planlama?hafta=${ymd(ws)}${showAll ? "" : "&tumu=1"}`}>{showAll ? "Yalnız bu hafta görevliler" : `Tüm personel (+${hidden} izinde)`}</Link>
          <Link className="btn" href="/planlama/rotasyon">↻ Ekip rotasyonu</Link>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card kpi accent"><div className="v">{errPeople.length}</div><div className="l">Kural ihlali / belge sorunu olan kişi</div></div>
        <div className="card kpi"><div className="v">{totNightShifts}</div><div className="l">Gece görevi (≥3 sa, 20:00–06:00)</div></div>
        <div className="card kpi"><div className="v">{hm(totOvertime)}</div><div className="l">Toplam fazla mesai (saat:dk)</div></div>
        <div className={`card kpi ${exUsed >= EXCEPTION_MONTHLY_LIMIT ? "accent" : ""}`}><div className="v">{exUsed}/{EXCEPTION_MONTHLY_LIMIT}</div><div className="l">Bu ay acil durum istisnası</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 14, padding: "10px 16px", fontSize: 12, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
          {[["WORK", "Görev (gündüz)"], ["NIGHT", "Görev (gece ağırlıklı)"], ["STANDBY", "Hazır bulunma"], ["TRAINING", "Eğitim"], ["LEAVE", "İzin"]].map(([k, l]) => <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 14, height: 10, borderRadius: 2, background: COLORS[k] }} />{l}</span>)}
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 14, height: 10, background: "repeating-linear-gradient(135deg,var(--plan-line) 0 3px,var(--plan-bg) 3px 6px)", border: "1px solid var(--border)" }} />Gece dilimi</span>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 14, height: 4, background: "var(--bad)" }} />İhlal penceresi</span>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 14, height: 10, border: "2px dashed var(--bad)" }} />İstisnayla kaydedilmiş</span>
          <span className="muted" style={{ marginLeft: "auto" }}><Term n={37}>Hazır bulunma</Term> profil kuralına göre çalışma sayılır (R-029 taslak)</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1240 }}>
            <div style={{ display: "grid", gridTemplateColumns: "250px 1fr 330px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              <div style={{ padding: "8px 12px" }}>Personel · profil</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>{DOW.map((d, i) => <div key={d} style={{ padding: "8px 6px", borderLeft: "1px solid var(--border)", fontWeight: ymd(ws + i * DAY) === ymd(now) ? 800 : 600, color: ymd(ws + i * DAY) === ymd(now) ? "var(--orange)" : undefined }}>{d} {ymd(ws + i * DAY).slice(8)}.{ymd(ws + i * DAY).slice(5, 7)}</div>)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", padding: "8px 6px", gap: 4 }}><span>Hafta</span><span>Gece</span><span>Min 24s</span><span>Min 7g</span><span>Durum</span></div>
            </div>
            {groups.map((g) => (
              <div key={g}>
                <div style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--navy-800)", background: "var(--plan-today)", borderBottom: "1px solid var(--border)" }}>{g}</div>
                {board.filter((b) => (b.person.unit ?? "Diğer") === g).map((b) => {
                  const m = b.evaluation.metrics;
                  const errs = b.evaluation.violations.filter((v) => v.severity === "ERROR");
                  const certErr = b.certs.filter((c) => c.severity === "ERROR");
                  const ot = m.weekly.reduce((a, w) => a + w.overtimeMinutes, 0);
                  const prof = profileByCode(b.person.workProfile);
                  return (
                    <div key={b.person.id} style={{ display: "grid", gridTemplateColumns: "250px 1fr 330px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                      <div style={{ padding: "6px 12px", fontSize: 12.5, minWidth: 0 }}>
                        <Link href={`/personel/${b.person.id}`} style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.person.fullName.replace("ÖRNEK ", "")}</Link>
                        <span className="muted" style={{ fontSize: 11 }}>{b.person.title} · {prof.code === "STCW_MLC" ? "STCW/MLC" : "İş Kanunu"}</span>
                      </div>
                      <div style={{ position: "relative", height: 40, borderLeft: "1px solid var(--border)" }}>
                        {[...Array(7)].map((_, i) => <div key={`d${i}`} style={{ position: "absolute", left: `${(i / 7) * 100}%`, top: 0, bottom: 0, borderLeft: i ? "1px solid var(--plan-bg-2)" : "none" }} />)}
                        {[...Array(8)].map((_, i) => { const ns = ws + (i - 1) * DAY + 20 * 3600_000, ne = ns + 10 * 3600_000; return <div key={`n${i}`} style={{ position: "absolute", left: `${pct(ns)}%`, width: `${pct(ne) - pct(ns)}%`, top: 0, bottom: 0, background: "repeating-linear-gradient(135deg,var(--plan-night-bg) 0 3px,transparent 3px 6px)" }} />; })}
                        {b.intervals.map((iv) => {
                          const nightShare = (() => { let n = 0; for (let t = iv.start; t < iv.end; t += 15 * 60_000) { const h = new Date(t + TZ).getUTCHours(); if (h >= 20 || h < 6) n++; } return n / Math.max(1, (iv.end - iv.start) / (15 * 60_000)); })();
                          const color = iv.category === "WORK" && nightShare > 0.5 ? COLORS.NIGHT : COLORS[iv.category];
                          const l = pct(iv.start), w = Math.max(0.4, pct(iv.end) - l);
                          return <div key={iv.id} title={`${iv.label}${iv.operationRef ? ` · ${iv.operationRef}` : ""} · ${ymd(iv.start)} ${tm(iv.start)} – ${ymd(iv.end)} ${tm(iv.end)}${iv.exception ? " · ACİL DURUM İSTİSNASI" : ""}${iv.status === "PLANNED" ? " · planlı" : ""}`}
                            style={{ position: "absolute", left: `${l}%`, width: `${w}%`, top: 8, height: 20, borderRadius: 4, background: iv.category === "LEAVE" ? `repeating-linear-gradient(45deg,${color} 0 4px,var(--plan-ghost) 4px 8px)` : color, opacity: iv.status === "PLANNED" ? 0.78 : 1, outline: iv.exception ? "2px dashed var(--bad)" : "none", outlineOffset: 1, color: "#fff", fontSize: 10, lineHeight: "20px", paddingLeft: 4, overflow: "hidden", whiteSpace: "nowrap" }}>{w > 3.5 ? `${tm(iv.start)}–${tm(iv.end)}` : ""}</div>;
                        })}
                        {errs.filter((v) => v.windowStart).map((v, i) => <div key={`v${i}`} title={v.message} style={{ position: "absolute", left: `${pct(v.windowStart!)}%`, width: `${Math.max(0.5, pct(v.windowEnd ?? v.windowStart!) - pct(v.windowStart!))}%`, bottom: 2, height: 4, background: "var(--bad)", borderRadius: 2, opacity: 0.85 }} />)}
                        {now >= ws && now < we && <div style={{ position: "absolute", left: `${pct(now)}%`, top: 0, bottom: 0, width: 2, background: "var(--orange)" }} title="Şimdi" />}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", padding: "4px 6px", gap: 4, fontSize: 12, alignItems: "center" }}>
                        <span className="mono">{hm(m.workMinutes)}{ot > 0 && <div style={{ color: "var(--warn)", fontSize: 10.5 }}>+{hm(ot)} FM</div>}</span>
                        <span className="mono">{m.nightShifts}× <span className="muted" style={{ fontSize: 10.5 }}>{hm(m.nightMinutes)}</span></span>
                        <span className="mono" style={{ color: prof.minRest24h && m.minRest24h !== null && m.minRest24h < prof.minRest24h ? "var(--bad)" : undefined }}>{hm(m.minRest24h)}</span>
                        <span className="mono" style={{ color: prof.minRest7d && m.minRest7d !== null && m.minRest7d < prof.minRest7d ? "var(--bad)" : undefined }}>{hm(m.minRest7d)}</span>
                        <span>{errs.length || certErr.length ? <span className="badge bad" title={[...errs, ...certErr].map((v) => v.message).join("\n")}>{errs.length + certErr.length} sorun</span> : b.certs.length ? <span className="badge warn" title={b.certs.map((c) => c.message).join("\n")}>Belge</span> : <span className="badge ok">✓</span>}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Kural ihlalleri ve belge sorunları</h2>
          {errPeople.length === 0 && <div className="muted">Bu hafta ihlal yok.</div>}
          {errPeople.map((b) => (
            <div key={b.person.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <Link href={`/personel/${b.person.id}`}><b>{b.person.fullName.replace("ÖRNEK ", "")}</b></Link> <span className="muted">· {profileByCode(b.person.workProfile).name}</span>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {[...b.evaluation.violations.filter((v) => v.severity === "ERROR"), ...b.certs.filter((c) => c.severity === "ERROR")].map((v, i) => <li key={i} style={{ color: "var(--bad)" }}>{v.message}</li>)}
                {b.intervals.filter((i) => i.exception).map((i) => <li key={i.id} style={{ color: "var(--warn)" }}>Acil durum istisnasıyla kaydedilmiş: {i.label} ({ymd(i.start)} {tm(i.start)})</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>İş yükü dağılımı (adalet)</h2>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Tek puan yerine ayrı göstergeler: haftalık çalışma ve gece görevi sayısı. İzinli veya yedekte tutulan personelin düşük yükü "düşük performans" değildir.</div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {board.filter((b) => b.person.crewRole !== "KIYI_OPS").map((b) => (
              <div key={b.person.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", gap: 8, alignItems: "center", fontSize: 11.5, padding: "3px 0" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.person.fullName.replace("ÖRNEK ", "")}</span>
                <span title="Haftalık çalışma"><span style={{ display: "inline-block", height: 8, width: `${(b.evaluation.metrics.workMinutes / maxHours) * 100}%`, background: "var(--navy-700)", borderRadius: 2 }} /> <span className="mono">{hm(b.evaluation.metrics.workMinutes)}</span></span>
                <span title="Gece görevi"><span style={{ display: "inline-block", height: 8, width: `${(b.evaluation.metrics.nightShifts / maxNight) * 100}%`, background: COLORS.NIGHT, borderRadius: 2 }} /> <span className="mono">{b.evaluation.metrics.nightShifts} gece</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card"><h2><Term n={36}>Vardiya</Term> / görev ekle</h2>
          <ShiftForm people={fullBoard.map((b) => ({ id: b.person.id, label: `${b.person.fullName.replace("ÖRNEK ", "")} — ${b.person.title}` }))} assets={assets.sort((x, y) => (x.code ?? "Z" + x.name).localeCompare(y.code ?? "Z" + y.name, "tr", { numeric: true })).map((a) => ({ id: a.id, label: a.code ? `${a.code} · ${a.name}` : a.name }))} defaultDay={ymd(Math.max(ws, Math.min(now, we - DAY)))} exLimit={EXCEPTION_MONTHLY_LIMIT} exUsed={exUsed} />
        </div>
        <div className="card"><h2>Operasyon için ekip önerisi</h2>
          <CrewSuggest ops={ops.map((o) => ({ ref: o.ref, label: `${o.ref} · ${o.vessel}`, start: o.plannedStart ? new Date(o.plannedStart.getTime() + TZ).toISOString().slice(0, 16) : "" }))} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
        Profiller: {PROFILES.map((p) => `${p.name} — ${p.basis} (${p.status === "EXPERT_REVIEW" ? "uzman kontrolünde" : p.status === "SOURCE_FOUND" ? "kaynak bulundu" : "onaylı"})`).join(" · ")}. Yazılımın önerisi kaptan ve operasyon sorumlusunun emniyet değerlendirmesinin yerine geçmez.
      </div>
    </>
  );
}
