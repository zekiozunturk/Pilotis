"use client";
import { useActionState, useDeferredValue, useMemo, useState } from "react";
import { simulate, scenarios, teamsOf, teamDuty, validateModel, TEAM_LETTERS, type RotationModel, type TugMode, type Simulation } from "@/lib/planning/rotation";
import { profileByCode } from "@/lib/planning/profiles";
import { saveRotation, applyRotation, type RState } from "./actions";
import { submitWith } from "@/components/ActionForm";

const P = profileByCode("STCW_MLC");
const DAY = 86_400_000, TZ = 3 * 3600_000;
const h1 = (m: number | null) => (m === null ? "—" : `${Math.round((m / 60) * 10) / 10} sa`);
const r1 = (x: number) => Math.round(x * 10) / 10;
const BAND: Record<string, { c: string; bg: string }> = { OK: { c: "var(--ok)", bg: "var(--ok-bg)" }, WARN: { c: "var(--warn)", bg: "var(--warn-bg)" }, RISK: { c: "var(--bad)", bg: "var(--bad-bg)" } };
const DOW = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

function Dial({ score, band, label, size = 120 }: { score: number; band: string; label: string; size?: number }) {
  const c = BAND[band]?.c ?? "var(--navy-700)";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${c} ${score * 3.6}deg, var(--border) 0)`, display: "grid", placeItems: "center", flex: "none" }}>
      <div style={{ width: size - 18, height: size - 18, borderRadius: "50%", background: "var(--surface, #fff)", display: "grid", placeItems: "center", textAlign: "center" }}>
        <div><div style={{ fontSize: size / 3.4, fontWeight: 800, color: c, lineHeight: 1 }}>{score}</div><div style={{ fontSize: 11, fontWeight: 700, color: c }}>{label}</div></div>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <div>
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} aria-label={label} />
        <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 64 }} aria-label={`${label} (sayı)`} />
        {suffix && <span className="muted" style={{ fontSize: 12 }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function RotationLab({ initial, savedAt, canSave, canApply, todayMs, nextMonday }: { initial: RotationModel; savedAt: string | null; canSave: boolean; canApply: boolean; todayMs: number; nextMonday: string }) {
  const [m, setM] = useState<RotationModel>(initial);
  const dm = useDeferredValue(m);
  const errors = useMemo(() => validateModel(dm), [dm]);
  const sim = useMemo<Simulation | null>(() => (errors.length ? null : simulate(dm, P)), [dm, errors]);
  const scen = useMemo(() => (errors.length ? [] : scenarios(dm).map((x) => ({ ...x, sim: x.key === "current" ? sim! : simulate(x.model, P) }))), [dm, errors, sim]);
  const dirty = JSON.stringify(m) !== JSON.stringify(initial);
  const savedSim = useMemo(() => (validateModel(initial).length ? null : simulate(initial, P)), [initial]);
  const [saveSt, save, saving] = useActionState<RState, FormData>(saveRotation, null);
  const [applySt, apply, applying] = useActionState<RState, FormData>(applyRotation, null);
  const set = <K extends keyof RotationModel>(k: K, v: RotationModel[K]) => setM((x) => ({ ...x, [k]: v }));
  const setTug = (i: number, patch: Partial<RotationModel["tugs"][number]>) => setM((x) => ({ ...x, tugs: x.tugs.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const nextTugId = () => { let n = m.tugs.length + 1; while (m.tugs.some((t) => t.id === `R${n}`)) n++; return `R${n}`; };

  // Takvim şeridi: bugünün haftasından 4 hafta
  const anchor = new Date(`${dm.anchor}T00:00:00+03:00`).getTime();
  const d0 = new Date(todayMs + TZ); d0.setUTCHours(0, 0, 0, 0);
  const weekStart = d0.getTime() - TZ - ((d0.getUTCDay() + 6) % 7) * DAY;
  const days = Array.from({ length: 28 }, (_, i) => weekStart + i * DAY);
  const teams = errors.length ? [] : teamsOf(dm);
  const onNow = teams.filter((t) => teamDuty(dm, t, Math.floor((todayMs - anchor) / DAY))).length;

  return (
    <>
      {/* ───── Özet ───── */}
      <div className="grid" style={{ gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
        <div className="card" style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {sim ? <Dial score={sim.system.score} band={sim.system.band} label={sim.system.bandLabel} /> : <div className="muted">Model geçersiz</div>}
          <div style={{ fontSize: 12.5, maxWidth: 220 }}>
            <b style={{ fontSize: 14 }}>Sistem sağlığı (model)</b>
            <div className="muted" style={{ marginTop: 4 }}>Her ekibin kayan 24 saat / 7 gün dinlenmesi, ardışık görev günü ve haftalık yükünden hesaplanır.</div>
            {sim?.system.capped && <div style={{ color: BAND[sim.system.band].c, marginTop: 4, fontWeight: 600 }}>{sim.system.peopleWithErrors ? "Kural ihlali olduğu için skor 69 ile sınırlandı" : "Ardışık gün sınırı aşıldığı için skor 84 ile sınırlandı"}</div>}
          </div>
        </div>
        <div className="grid g4">
          <div className="card kpi accent"><div className="v">{sim?.staffing.total ?? "—"}</div><div className="l">Gerekli kadro (kişi) · {sim?.staffing.crew ?? "—"} ekip + {sim?.staffing.reserve ?? "—"} yedek</div></div>
          <div className="card kpi"><div className="v">{sim?.staffing.teams ?? "—"}</div><div className="l">Ekip · römorkör başına {sim?.staffing.teamsPerTug ?? "—"} ({m.onDays}/{m.offDays} döngüsü)</div></div>
          <div className="card kpi"><div className="v">{sim ? h1(sim.system.worst7) : "—"}</div><div className="l">En kötü 7 günlük dinlenme (gerekli 77 sa)</div></div>
          <div className="card kpi"><div className="v">{sim ? h1(sim.system.worst24) : "—"}</div><div className="l">En kötü 24 saatlik dinlenme (gerekli 10 sa)</div></div>
        </div>
      </div>

      {errors.length > 0 && <div className="alert bad" style={{ marginBottom: 12 }}><span>⚠</span><div><b>Model geçersiz</b>{errors.join(" · ")}</div></div>}

      <div className="grid g2" style={{ marginBottom: 16, alignItems: "start" }}>
        {/* ───── Ayarlar ───── */}
        <div className="card">
          <h3>Çalışma düzeni {dirty && <span className="badge warn">kaydedilmemiş değişiklik</span>}</h3>
          <div className="toolbar" style={{ marginBottom: 10, flexWrap: "wrap" }}>
            {[[7, 7], [6, 6], [7, 14], [14, 14]].map(([a, b]) => <button key={`${a}-${b}`} type="button" className={`btn ${m.onDays === a && m.offDays === b ? "" : "secondary"}`} onClick={() => setM((x) => ({ ...x, onDays: a, offDays: b }))}>{a} gün görev / {b} gün izin</button>)}
          </div>
          <div className="grid g2" style={{ gap: 10 }}>
            <Num label="Görev günü (ardışık)" value={m.onDays} min={1} max={28} onChange={(v) => set("onDays", v)} suffix="gün" />
            <Num label="İzin günü" value={m.offDays} min={0} max={28} onChange={(v) => set("offDays", v)} suffix="gün" />
            <div><label>Gündüz vardiyası başlangıcı</label><input type="time" value={m.day.start} onChange={(e) => set("day", { ...m.day, start: e.target.value })} /></div>
            <Num label="Gündüz vardiyası süresi" value={m.day.hours} min={4} max={18} step={0.5} onChange={(v) => set("day", { ...m.day, hours: v })} suffix="sa" />
            <div><label>Gece vardiyası başlangıcı</label><input type="time" value={m.night.start} onChange={(e) => set("night", { ...m.night, start: e.target.value })} /></div>
            <Num label="Gece vardiyası süresi" value={m.night.hours} min={4} max={18} step={0.5} onChange={(v) => set("night", { ...m.night, hours: v })} suffix="sa" />
            <Num label="Yedek havuzu (izin, rapor, eğitim)" value={m.reservePct} min={0} max={50} onChange={(v) => set("reservePct", v)} suffix="%" />
            <div><label>A ekiplerinin ilk görev günü</label><input type="date" value={m.anchor} onChange={(e) => e.target.value && set("anchor", e.target.value)} /></div>
          </div>
          <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={m.nightRotation} onChange={(e) => set("nightRotation", e.target.checked)} /> Gece görevini römorkörler arasında döndür (her görev döneminde gece römorkörü kayar — gece yükü tüm ekiplere eşit dağılır)</label>

          <h3 style={{ marginTop: 16 }}>Römorkörler ({m.tugs.filter((t) => t.mode === "DAY").length} gündüz · {m.tugs.filter((t) => t.mode === "NIGHT").length} gece)</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {m.tugs.map((t, i) => (
              <div key={t.id} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto auto", gap: 6, alignItems: "center" }}>
                <span className="mono muted" style={{ fontSize: 11 }}>{t.id}</span>
                <input value={t.name} onChange={(e) => setTug(i, { name: e.target.value })} aria-label={`${t.id} adı`} />
                <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {(["DAY", "NIGHT"] as TugMode[]).map((md) => <button key={md} type="button" onClick={() => setTug(i, { mode: md })} style={{ border: 0, padding: "6px 10px", fontSize: 12, cursor: "pointer", background: t.mode === md ? (md === "DAY" ? "var(--navy-700)" : "var(--plan-night)") : "transparent", color: t.mode === md ? "var(--btn-fg)" : "inherit" }}>{md === "DAY" ? "☀ Gündüz" : "☾ Gece"}</button>)}
                </div>
                <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} disabled={m.tugs.length <= 1} onClick={() => setM((x) => ({ ...x, tugs: x.tugs.filter((_, j) => j !== i) }))} aria-label={`${t.name} çıkar`}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={() => setM((x) => ({ ...x, tugs: [...x.tugs, { id: nextTugId(), name: `Römork-${nextTugId().slice(1)}`, mode: "DAY" }] }))}>+ Römorkör ekle</button>

          <h3 style={{ marginTop: 16 }}>Ekip başına görev rolleri ({m.roles.length} kişi)</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {m.roles.map((r, i) => <span key={r.code} className="badge grey" style={{ fontSize: 12 }}>{r.label} <button type="button" onClick={() => setM((x) => ({ ...x, roles: x.roles.filter((_, j) => j !== i) }))} disabled={m.roles.length <= 1} style={{ border: 0, background: "none", cursor: "pointer" }} aria-label={`${r.label} çıkar`}>✕</button></span>)}
            {[["KAPTAN", "Römorkör Kaptanı"], ["BASCARKCI", "Başçarkçı"], ["YAGCI", "Yağcı"], ["PIMCI", "Pimci"], ["GEMICI", "Gemici"], ["ASCI", "Aşçı"]].filter(([c]) => !m.roles.some((r) => r.code === c)).map(([c, l]) => <button key={c} type="button" className="btn secondary" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setM((x) => ({ ...x, roles: [...x.roles, { code: c, label: l }] }))}>+ {l}</button>)}
          </div>
          {dirty && <button type="button" className="btn secondary" style={{ marginTop: 12 }} onClick={() => setM(initial)}>↺ Kayıtlı modele dön</button>}
        </div>

        {/* ───── Sağlık bileşenleri + kadro ───── */}
        <div style={{ display: "grid", gap: 16 }}>
          {sim && (
            <div className="card">
              <h3>Sağlık skorunun bileşenleri</h3>
              {sim.system.parts.map((p) => (
                <div key={p.key} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><b>{p.label} <span className="muted">· ağırlık {p.weight}</span></b><span className="mono">{Math.round(p.value * p.weight)}/{p.weight}</span></div>
                  <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${p.value * 100}%`, height: "100%", background: p.value >= 0.99 ? "var(--ok)" : p.value >= 0.85 ? "var(--warn)" : "var(--bad)" }} /></div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{p.detail}</div>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>İşletme göstergesidir; hukuki uygunluk kararı değildir. Kurallar: {P.basis}.</div>
            </div>
          )}
          {sim && (
            <div className="card">
              <h3>Ekip sayısı nasıl bulundu?</h3>
              <table style={{ fontSize: 12.5 }}><tbody>
                <tr><td>Döngü</td><td className="mono">{m.onDays} görev + {m.offDays} izin = {sim.staffing.cycle} gün</td></tr>
                <tr><td>Römorkör başına ekip</td><td className="mono">⌈{sim.staffing.cycle} ÷ {m.onDays}⌉ = {sim.staffing.teamsPerTug} ({TEAM_LETTERS.slice(0, sim.staffing.teamsPerTug).split("").join(", ")})</td></tr>
                <tr><td>Toplam ekip</td><td className="mono">{m.tugs.length} römorkör × {sim.staffing.teamsPerTug} = {sim.staffing.teams}</td></tr>
                <tr><td>Ekip personeli</td><td className="mono">{sim.staffing.teams} × {m.roles.length} = {sim.staffing.crew}</td></tr>
                <tr><td>Yedek havuzu</td><td className="mono">⌈{sim.staffing.crew} × %{m.reservePct}⌉ = {sim.staffing.reserve}</td></tr>
                <tr><td><b>Gerekli kadro</b></td><td className="mono"><b>{sim.staffing.total} kişi</b></td></tr>
                <tr><td>Bugün görevde</td><td className="mono">{onNow} ekip · {onNow * m.roles.length} kişi (izinde {(sim.staffing.teams - onNow) * m.roles.length})</td></tr>
                <tr><td>Kişi başı yıllık</td><td className="mono">~{Math.round(365 * sim.staffing.onShare)} görev günü · ~{Math.round(sim.teams.reduce((a, t) => a + t.m.avgWeeklyHours, 0) / Math.max(1, sim.teams.length) * 52)} sa</td></tr>
              </tbody></table>
            </div>
          )}
          {sim && (
            <div className="card">
              <h3>Saatlik kapsama (görevdeki römorkör)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, alignItems: "end", height: 110 }}>
                {sim.coverage.hours.map((c) => {
                  const max = Math.max(1, ...sim.coverage.hours.map((x) => Math.max(x.max, x.expected)));
                  const short = c.min < c.expected;
                  return <div key={c.hour} title={`${String(c.hour).padStart(2, "0")}:00 — en az ${c.min}, en çok ${c.max}, beklenen ${c.expected}`} style={{ position: "relative", height: "100%", display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", height: `${(c.min / max) * 100}%`, background: short ? "var(--bad)" : c.hour >= 6 && c.hour < 20 ? "var(--navy-700)" : "var(--plan-night)", borderRadius: "3px 3px 0 0" }} />
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(c.expected / max) * 100}%`, borderTop: "2px dashed var(--orange)" }} />
                  </div>;
                })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, fontSize: 9.5 }} className="muted mono">{sim.coverage.hours.map((c) => <span key={c.hour} style={{ textAlign: "center" }}>{c.hour % 3 === 0 ? c.hour : ""}</span>)}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>{sim.coverage.gaps === 0 ? <span style={{ color: "var(--ok)" }}>✓ Ekip değişimlerinde dahil boşluk yok.</span> : <span style={{ color: "var(--bad)" }}>⚠ {sim.coverage.gaps} saatte görevdeki römorkör beklenenin altında.</span>} <span className="muted">Turuncu kesikli çizgi: beklenen (gündüz {sim.staffing.dayTugs}, gece {sim.staffing.nightTugs}; vardiyaların çakıştığı saatlerde toplam).</span></div>
            </div>
          )}
        </div>
      </div>

      {/* ───── Senaryolar ───── */}
      {scen.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Alternatif senaryolar — aynı römorkör ve ekip yapısıyla</h3>
          <div className="tablewrap"><table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Senaryo</th><th>Sağlık</th><th>Kadro</th><th>En kötü 7g dinlenme</th><th>En kötü 24s</th><th>Ardışık gün</th><th>Ort. haftalık</th><th>İhlalli kişi</th><th>Neden</th><th></th></tr></thead>
            <tbody>{scen.map((x) => (
              <tr key={x.key} style={{ background: x.key === "current" ? "var(--bg)" : undefined }}>
                <td><b>{x.title}</b></td>
                <td><span className="badge" style={{ background: BAND[x.sim.system.band].bg, color: BAND[x.sim.system.band].c }}>{x.sim.system.score} · {x.sim.system.bandLabel}</span></td>
                <td className="mono">{x.sim.staffing.total}</td>
                <td className="mono" style={{ color: (x.sim.system.worst7 ?? 1e9) < 77 * 60 ? "var(--bad)" : undefined }}>{h1(x.sim.system.worst7)}</td>
                <td className="mono">{h1(x.sim.system.worst24)}</td>
                <td className="mono" style={{ color: Math.max(...x.sim.teams.map((t) => t.m.maxConsecutiveDays)) > 6 ? "var(--warn)" : undefined }}>{Math.max(...x.sim.teams.map((t) => t.m.maxConsecutiveDays))}</td>
                <td className="mono">{r1(x.sim.teams.reduce((a, t) => a + t.m.avgWeeklyHours, 0) / x.sim.teams.length)} sa</td>
                <td className="mono">{x.sim.system.peopleWithErrors}</td>
                <td style={{ maxWidth: 280 }} className="muted">{x.why}</td>
                <td>{x.key !== "current" && <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => setM(x.model)}>Dene</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {/* ───── Takvim şeridi ───── */}
      {sim && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Rotasyon takvimi — 4 hafta</h3>
          <div className="tablewrap">
            <table style={{ fontSize: 11, borderCollapse: "separate", borderSpacing: 1, minWidth: 900 }}>
              <thead><tr><th style={{ minWidth: 170 }}>Ekip</th>{days.map((d) => { const x = new Date(d + TZ); const dow = (x.getUTCDay() + 6) % 7; return <th key={d} style={{ padding: 2, textAlign: "center", fontWeight: 600, background: d <= todayMs && todayMs < d + DAY ? "var(--orange)" : undefined, color: d <= todayMs && todayMs < d + DAY ? "var(--accent-fg, #fff)" : undefined }}>{DOW[dow]}<br />{x.getUTCDate()}</th>; })}</tr></thead>
              <tbody>{sim.teams.map((t) => (
                <tr key={t.key}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{t.tugName}</b> · {t.letter}</td>
                  {days.map((d) => { const md = teamDuty(dm, t, Math.round((d - anchor) / DAY)); return <td key={d} title={md ? (md === "DAY" ? `Gündüz ${dm.day.start} +${dm.day.hours} sa` : `Gece ${dm.night.start} +${dm.night.hours} sa`) : "İzin"} style={{ padding: 0, height: 18, background: md === "DAY" ? "var(--navy-700)" : md === "NIGHT" ? "var(--plan-night)" : "var(--bg)", color: "#fff", textAlign: "center" }}>{md === "NIGHT" ? "☾" : ""}</td>; })}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Lacivert: gündüz görevi · Mor ☾: gece görevi · Açık: izin. Turuncu sütun bugün.</div>
        </div>
      )}

      {/* ───── Ekip bazında dinlenme ───── */}
      {sim && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Ekip bazında dinlenme seviyeleri (model)</h3>
          <div className="tablewrap"><table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Ekip</th><th>Vardiya</th><th>Sağlık</th><th>En düşük 24s dinl.</th><th>En düşük 7g dinl.</th><th>Görev günü ort. dinl.</th><th>Ardışık gün</th><th>Ort. haftalık</th><th>En yoğun hafta</th><th>Fazla mesai/hafta</th><th>Gece/hafta</th><th>İlk bulgu</th></tr></thead>
            <tbody>{sim.teams.map((t) => (
              <tr key={t.key}>
                <td><b>{t.tugName}</b> · {t.letter}</td><td>{t.mode}</td>
                <td><span className="badge" style={{ background: BAND[t.m.health.band].bg, color: BAND[t.m.health.band].c }}>{t.m.health.score}</span></td>
                <td className="mono" style={{ color: (t.m.minRest24h ?? 1e9) < 600 ? "var(--bad)" : undefined }}>{h1(t.m.minRest24h)}</td>
                <td className="mono" style={{ color: (t.m.minRest7d ?? 1e9) < 77 * 60 ? "var(--bad)" : undefined }}>{h1(t.m.minRest7d)}</td>
                <td className="mono">{t.m.avgDailyRestOnDuty === null ? "—" : `${r1(t.m.avgDailyRestOnDuty)} sa`}</td>
                <td className="mono" style={{ color: t.m.maxConsecutiveDays > 6 ? "var(--warn)" : undefined }}>{t.m.maxConsecutiveDays}</td>
                <td className="mono">{r1(t.m.avgWeeklyHours)} sa</td><td className="mono">{r1(t.m.maxWeekHours)} sa</td><td className="mono">{r1(t.m.avgOvertimeHours)} sa</td><td className="mono">{r1(t.m.nightShiftsPerWeek)}</td>
                <td style={{ fontSize: 11.5, maxWidth: 360, color: t.m.errors.length ? "var(--bad)" : t.m.warnings.length ? "var(--warn)" : "var(--ok)" }}>{t.m.errors[0]?.message ?? t.m.warnings.find((w) => w.code === "CONSECUTIVE_DAYS")?.message ?? "Uygun"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {/* ───── Kaydet / uygula ───── */}
      <div className="grid g2" style={{ marginBottom: 16, alignItems: "start" }}>
        <form onSubmit={submitWith(save)} className="card">
          <h3>Modeli kaydet</h3>
          <input type="hidden" name="model" value={JSON.stringify(m)} />
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{savedAt ? `Son kayıt: ${savedAt}` : "Henüz kayıtlı model yok — varsayılan model gösteriliyor."} Kaydetmek yalnız operasyon/işletme yöneticisi yetkisindedir; önceki model denetim kaydında saklanır.</div>
          <label>Değişiklik notu *</label><input name="note" placeholder="ör. Gece römorkörü 2 → 3, günlük süre 13 saat" />
          <button className="btn orange" style={{ marginTop: 8 }} disabled={saving || !canSave || errors.length > 0}>{saving ? "Kaydediliyor…" : "Modeli kaydet"}</button>
          {!canSave && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Rolünüz modeli deneyebilir ama kaydedemez.</div>}
          {saveSt && <div role="status" className={`alert ${saveSt.ok ? "ok" : "bad"}`} style={{ marginTop: 8 }}><span>{saveSt.ok ? "✓" : "⚠"}</span><div>{saveSt.message}{saveSt.details?.map((d) => <div key={d} style={{ fontSize: 12 }}>{d}</div>)}</div></div>}
        </form>
        <form onSubmit={submitWith(apply)} className="card">
          <h3>Kayıtlı modeli takvime uygula</h3>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Ekiplere atanmış personel için vardiyalar oluşturulur. Aralıktaki eski <i>planlı</i> rotasyon kayıtları yenilenir; izin, eğitim veya ek görevle çakışan vardiya atlanır ve listelenir.</div>
          <div className="grid g2" style={{ gap: 8 }}>
            <div><label>Başlangıç</label><input type="date" name="from" defaultValue={nextMonday} /></div>
            <div><label>Süre (hafta)</label><input type="number" name="weeks" min={1} max={12} defaultValue={4} /></div>
          </div>
          {savedSim && savedSim.system.peopleWithErrors > 0 && <div className="alert bad" style={{ marginTop: 8 }}><span>⚠</span><div>Kayıtlı model {savedSim.system.peopleWithErrors} kişide dinlenme kuralını ihlal ediyor. Uygulamak için yazılı risk kabulü gerekir (R-033).</div></div>}
          <div style={{ marginTop: 8 }}>
            <label>Risk kabulü ve gerekçe {savedSim && savedSim.system.peopleWithErrors > 0 ? "*" : "(model veya geçiş kontrolünde ihlal çıkarsa zorunlu)"}</label>
            <input name="risk" placeholder="ör. Geçiş dönemi; 2 hafta içinde 6/6 düzenine geçilecek" />
          </div>
          {dirty && <div className="alert warn" style={{ marginTop: 8 }}><span>ⓘ</span><div>Ekrandaki değişiklikler henüz kaydedilmedi — takvime <b>kayıtlı</b> model uygulanır.</div></div>}
          <button className="btn" style={{ marginTop: 8 }} disabled={applying || !canApply}>{applying ? "Uygulanıyor…" : "Takvime uygula"}</button>
          {!canApply && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Yalnız operasyon/işletme yöneticisi uygulayabilir.</div>}
          {applySt && <div role="status" className={`alert ${applySt.ok ? "ok" : "bad"}`} style={{ marginTop: 8 }}><span>{applySt.ok ? "✓" : "⚠"}</span><div>{applySt.message}{applySt.details?.map((d) => <div key={d} style={{ fontSize: 11.5 }}>{d}</div>)}</div></div>}
        </form>
      </div>
    </>
  );
}
