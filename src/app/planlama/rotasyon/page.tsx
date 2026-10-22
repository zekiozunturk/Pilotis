import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage, currentRole } from "@/lib/session";
import { getRotationModel } from "@/lib/planning/rotation-store";
import { teamsOf, measure, systemHealth, teamLabel, type UnitMeasure } from "@/lib/planning/rotation";
import { personIntervals } from "@/lib/planning/service";
import { profileByCode } from "@/lib/planning/profiles";
import { Term } from "@/components/Term";
import { RotationLab } from "./lab";
import { SlotSelect } from "./roster";

export const metadata = { title: "Ekip rotasyonu" };
export const dynamic = "force-dynamic";
const DAY = 86_400_000, TZ = 3 * 3600_000;
const h1 = (m: number | null) => (m === null ? "—" : `${Math.round((m / 60) * 10) / 10} sa`);
const BAND: Record<string, [string, string]> = { OK: ["var(--ok)", "var(--ok-bg)"], WARN: ["var(--warn)", "var(--warn-bg)"], RISK: ["var(--bad)", "var(--bad-bg)"] };
function mondayOf(ms: number) { const d = new Date(ms + TZ); d.setUTCHours(0, 0, 0, 0); return d.getTime() - TZ - ((d.getUTCDay() + 6) % 7) * DAY; }
const ymd = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10);

export default async function Rotation() {
  await requireInternalPage();
  const role = await currentRole();
  const canSave = ["OPERATIONS_MANAGER", "BUSINESS_MANAGER", "SYSTEM_ADMIN"].includes(role);
  const { model, saved, updatedAt, updatedBy } = await getRotationModel();
  const P = profileByCode("STCW_MLC");
  const now = Date.now();
  const ws = mondayOf(now);

  // Kadro: ekip yuvaları ve atanmış kişiler (kayıtlı modele göre)
  const crew = await db.select().from(s.personnel).where(eq(s.personnel.active, true)).orderBy(asc(s.personnel.fullName));
  const roleCodes = new Set(model.roles.map((r) => r.code));
  const eligible = crew.filter((p) => p.crewRole && roleCodes.has(p.crewRole));
  const teams = teamsOf(model);
  const bySlot = new Map(eligible.filter((p) => p.rotationTeam).map((p) => [`${p.rotationTeam}|${p.crewRole}`, p]));
  const filled = teams.reduce((a, t) => a + model.roles.filter((r) => bySlot.has(`${t.key}|${r.code}`)).length, 0);
  const needed = teams.length * model.roles.length;
  const pool = eligible.filter((p) => !p.rotationTeam || !teams.some((t) => t.key === p.rotationTeam));

  // Gerçek ölçüm: atanmış kişilerin takvimdeki kayıtlarından (geçen 2 hafta + bu hafta + gelecek hafta)
  const from = ws - 14 * DAY, to = ws + 14 * DAY;
  const assigned = eligible.filter((p) => p.rotationTeam && teams.some((t) => t.key === p.rotationTeam));
  const actual: (UnitMeasure & { team: string | null; role: string | null; id: string })[] = [];
  for (const p of assigned) {
    const ivs = await personIntervals(p.id, from, to);
    actual.push({ ...measure(p.id, p.fullName.replace("ÖRNEK ", ""), 1, ivs, profileByCode(p.workProfile), from, to), team: teamLabel(model, p.rotationTeam), role: p.crewRole, id: p.id });
  }
  const sys = actual.length ? systemHealth(actual, P) : null;
  actual.sort((a, b) => a.health.score - b.health.score || (a.minRest7d ?? 0) - (b.minRest7d ?? 0));

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Ekip <Term n={45}>rotasyonu</Term> ve sistem sağlığı</h1>
          <div className="muted">Römorkör sayısı, gündüz/gece dağılımı, ekip başına kişi, görev/izin günleri ve vardiya süreleri değiştirilebilir; sonuç anında yeniden hesaplanır. Gerekli <Term n={46}>ekip</Term> sayısı izin haftası dikkate alınarak bulunur.</div>
        </div>
        <div className="toolbar"><Link className="btn secondary" href="/planlama">← Haftalık plan</Link></div>
      </div>

      <div className="alert info" style={{ marginBottom: 16 }}><span>ⓘ</span><div>
        <b>Mevcut düzen (işletme beyanı):</b> ekip 1 hafta her gün 14 saat çalışır, ardından 1 hafta izindedir; 7 römorkörden 5'i gündüz, 2'si gece aktiftir; her römorkörde 4 kişi görevlidir. 7 gün × 14 saat = <b>98 saat</b> çalışma, 7 günlük pencerede yalnız <b>70 saat dinlenme</b> bırakır (STCW/MLC en az 77 saat). Ayrıca 7 ardışık görev günü, liman hizmetindeki gemiadamı için haftada 6 gün sınırını (854 s. Deniz İş Kanunu) aşar; <Term n={47}>hafta tatili</Term> münavebeyle verilebilir — hukuk onayı bekliyor (R-030).
      </div></div>

      <RotationLab initial={model} savedAt={saved && updatedAt ? `${updatedAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · ${updatedBy ?? ""}` : null} canSave={canSave} canApply={canSave} todayMs={now} nextMonday={ymd(ws + 7 * DAY)} />

      {/* ───── Gerçek durum ───── */}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: 16, marginBottom: 16, alignItems: "start" }}>
        <div className="card">
          <h3>Gerçek durum — takvimdeki kayıtlardan</h3>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{ymd(from)} – {ymd(to - DAY)} arası; ek görevler, izinler ve eğitimler dahil. Ekiplere atanmış {assigned.length} kişi ölçüldü.</div>
          {sys ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 44, fontWeight: 800, color: BAND[sys.band][0] }}>{sys.score}</span>
                <span className="badge" style={{ background: BAND[sys.band][1], color: BAND[sys.band][0] }}>{sys.bandLabel}</span>
              </div>
              <table style={{ fontSize: 12.5, marginTop: 6 }}><tbody>
                <tr><td>İhlali olan kişi</td><td className="mono" style={{ color: sys.peopleWithErrors ? "var(--bad)" : "var(--ok)" }}>{sys.peopleWithErrors} / {sys.people}</td></tr>
                <tr><td>En kötü 24s dinlenme</td><td className="mono">{h1(sys.worst24)}</td></tr>
                <tr><td>En kötü 7g dinlenme</td><td className="mono">{h1(sys.worst7)}</td></tr>
                {sys.parts.map((p) => <tr key={p.key}><td>{p.label}</td><td className="mono">{Math.round(p.value * p.weight)}/{p.weight} <span className="muted">· {p.detail}</span></td></tr>)}
              </tbody></table>
            </>
          ) : <div className="muted">Ekiplere atanmış personel yok.</div>}
        </div>
        <div className="card">
          <h3>Kişi bazında dinlenme seviyeleri (en riskli önce)</h3>
          <div className="tablewrap" style={{ maxHeight: 420, overflowY: "auto" }}><table style={{ fontSize: 12 }}>
            <thead><tr><th>Kişi</th><th>Ekip</th><th>Sağlık</th><th>24s dinl.</th><th>7g dinl.</th><th>Ardışık</th><th>Ort. hafta</th><th>Bulgu</th></tr></thead>
            <tbody>{actual.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/personel/${a.id}`}>{a.label}</Link></td>
                <td className="muted">{a.team}</td>
                <td><span className="badge" style={{ background: BAND[a.health.band][1], color: BAND[a.health.band][0] }}>{a.health.score}</span></td>
                <td className="mono" style={{ color: (a.minRest24h ?? 1e9) < 600 ? "var(--bad)" : undefined }}>{h1(a.minRest24h)}</td>
                <td className="mono" style={{ color: (a.minRest7d ?? 1e9) < 77 * 60 ? "var(--bad)" : undefined }}>{h1(a.minRest7d)}</td>
                <td className="mono">{a.maxConsecutiveDays}</td>
                <td className="mono">{Math.round(a.avgWeeklyHours * 10) / 10} sa</td>
                <td style={{ fontSize: 11.5, color: a.errors.length ? "var(--bad)" : "var(--ok)", maxWidth: 320 }}>{a.errors[0]?.message ?? "Uygun"}{a.errors.length > 1 ? ` (+${a.errors.length - 1})` : ""}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>

      {/* ───── Kadro ───── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Ekip kadrosu — kayıtlı modele göre ({filled}/{needed} yuva dolu{pool.length ? ` · yedek havuzda ${pool.length} kişi` : ""})</h3>
        {filled < needed && <div className="alert warn" style={{ marginBottom: 8 }}><span>⚠</span><div>{needed - filled} ekip yuvası boş. Boş yuvası olan ekip görev haftasında eksik personelle çıkar; yedek havuzdan atayın veya işe alım planlayın.</div></div>}
        <div className="tablewrap"><table style={{ fontSize: 12.5 }}>
          <thead><tr><th>Ekip</th>{model.roles.map((r) => <th key={r.code}>{r.label}</th>)}</tr></thead>
          <tbody>{teams.map((t) => (
            <tr key={t.key}>
              <td style={{ whiteSpace: "nowrap" }}><b>{t.tugName}</b> · {t.letter} ekibi <span className="mono muted" style={{ fontSize: 10.5 }}>{t.key}</span></td>
              {model.roles.map((r) => {
                const cur = bySlot.get(`${t.key}|${r.code}`);
                const opts = eligible.filter((p) => p.crewRole === r.code).map((p) => ({ id: p.id, name: p.fullName, teamLabel: teamLabel(model, p.rotationTeam) }));
                return <td key={r.code} style={{ minWidth: 190 }}><SlotSelect team={t.key} role={r.label} current={cur?.id ?? null} options={opts} /></td>;
              })}
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}
