import Link from "next/link";
import { and, asc, desc, eq, gt, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDT, fmtTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/session";
import { deviceLabel, END_LABEL, FAIL_LABEL, fmtDur, IDLE_MS } from "@/lib/session-log";
import { pageTitle } from "@/data/yunus";
import type { Role } from "@/lib/workflow";
import { requireAdmin } from "../_guard";

export const metadata = { title: "Oturum kayıtları" };
export const dynamic = "force-dynamic";
const PER = 50;
type SP = { q?: string; gun?: string; durum?: string; log?: string; s?: string };

export default async function Oturumlar({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const gun = ["1", "7", "30", "90"].includes(sp.gun ?? "") ? Number(sp.gun) : 7;
  const durum = sp.durum ?? "";
  const page = Math.max(1, Number(sp.s) || 1);
  const q = (sp.q ?? "").trim();
  const now = Date.now(), from = new Date(now - gun * 864e5), onlineAfter = new Date(now - 2 * 60_000), idleAfter = new Date(now - IDLE_MS);

  const conds: SQL[] = [gte(s.sessionLogs.loginAt, from)];
  if (q) conds.push(or(ilike(s.sessionLogs.username, `%${q}%`), ilike(s.users.name, `%${q}%`))!);
  if (durum === "hatali") conds.push(eq(s.sessionLogs.success, false));
  if (durum === "basarili") conds.push(eq(s.sessionLogs.success, true));
  if (durum === "acik") conds.push(eq(s.sessionLogs.success, true), sql`${s.sessionLogs.logoutAt} is null`, gt(s.sessionLogs.lastSeenAt, idleAfter));
  const where = and(...conds);

  const rows = await db.select({ l: s.sessionLogs, name: s.users.name, roles: s.users.roles }).from(s.sessionLogs).leftJoin(s.users, eq(s.users.id, s.sessionLogs.userId))
    .where(where).orderBy(desc(s.sessionLogs.loginAt)).limit(PER).offset((page - 1) * PER);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.sessionLogs).leftJoin(s.users, eq(s.users.id, s.sessionLogs.userId)).where(where);

  const [t] = await db.select({
    ok: sql<number>`count(*) filter (where ${s.sessionLogs.success})::int`,
    fail: sql<number>`count(*) filter (where not ${s.sessionLogs.success})::int`,
    people: sql<number>`count(distinct ${s.sessionLogs.userId}) filter (where ${s.sessionLogs.success})::int`,
    active: sql<number>`coalesce(sum(${s.sessionLogs.activeSeconds}),0)::int`,
    avg: sql<number>`coalesce(avg(${s.sessionLogs.activeSeconds}) filter (where ${s.sessionLogs.success}),0)::int`,
  }).from(s.sessionLogs).where(gte(s.sessionLogs.loginAt, from));
  const online = await db.select({ u: s.sessionLogs.username, name: s.users.name, path: s.sessionLogs.lastPath, at: s.sessionLogs.lastSeenAt }).from(s.sessionLogs).leftJoin(s.users, eq(s.users.id, s.sessionLogs.userId))
    .where(and(eq(s.sessionLogs.success, true), sql`${s.sessionLogs.logoutAt} is null`, gt(s.sessionLogs.lastSeenAt, onlineAfter))).orderBy(desc(s.sessionLogs.lastSeenAt));

  // kullanıcı bazında özet
  const perUser = await db.select({
    userId: s.sessionLogs.userId, username: sql<string>`max(${s.sessionLogs.username})`, name: sql<string>`max(${s.users.name})`,
    logins: sql<number>`count(*) filter (where ${s.sessionLogs.success})::int`, fails: sql<number>`count(*) filter (where not ${s.sessionLogs.success})::int`,
    active: sql<number>`coalesce(sum(${s.sessionLogs.activeSeconds}),0)::int`, pages: sql<number>`coalesce(sum(${s.sessionLogs.pageViews}),0)::int`,
    last: sql<Date>`max(${s.sessionLogs.lastSeenAt})`,
  }).from(s.sessionLogs).leftJoin(s.users, eq(s.users.id, s.sessionLogs.userId)).where(gte(s.sessionLogs.loginAt, from))
    .groupBy(s.sessionLogs.userId, sql`case when ${s.sessionLogs.userId} is null then ${s.sessionLogs.username} end`).orderBy(desc(sql`coalesce(sum(${s.sessionLogs.activeSeconds}),0)`)).limit(30);

  const detail = sp.log ? (await db.select({ l: s.sessionLogs, name: s.users.name }).from(s.sessionLogs).leftJoin(s.users, eq(s.users.id, s.sessionLogs.userId)).where(eq(s.sessionLogs.id, sp.log)))[0] : null;
  const views = detail ? await db.select().from(s.pageViews).where(eq(s.pageViews.logId, detail.l.id)).orderBy(asc(s.pageViews.at)).limit(300) : [];

  const qs = (o: Partial<SP>) => { const p = new URLSearchParams(); const m = { q, gun: String(gun), durum, ...o }; for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v)); return `?${p}`; };
  const state = (l: typeof s.sessionLogs.$inferSelect) => {
    if (!l.success) return <span className="badge bad">Hatalı · {FAIL_LABEL[l.failReason ?? ""] ?? l.failReason}</span>;
    if (l.logoutAt) return <span className="badge grey">{END_LABEL[l.endReason ?? ""] ?? "Kapandı"}</span>;
    if (l.lastSeenAt.getTime() > onlineAfter.getTime()) return <span className="badge ok">● Çevrimiçi</span>;
    if (l.lastSeenAt.getTime() > idleAfter.getTime()) return <span className="badge warn">Boşta</span>;
    return <span className="badge grey">Ayrıldı (çıkış yapmadan)</span>;
  };
  const span = (l: typeof s.sessionLogs.$inferSelect) => l.success ? Math.max(0, ((l.logoutAt ?? l.lastSeenAt).getTime() - l.loginAt.getTime()) / 1000) : 0;
  const pages = Math.max(1, Math.ceil(total / PER));

  return (
    <>
      <div className="pagehead">
        <div><h1>Oturum kayıtları</h1><div className="muted">Kim ne zaman girdi, ne kadar kaldı, hangi ekranlara baktı. Aktif süre yalnız PILOTIS sekmesi açık ve görünürken sayılır.</div></div>
        <div className="toolbar"><Link className="btn secondary" href="/yonetim">← Sistem yönetimi</Link><a className="btn secondary" href={`/api/yonetim/oturumlar${qs({})}`}>CSV indir</a></div>
      </div>

      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="tile"><div className="l">Şu an çevrimiçi</div><div className="v">{online.length}</div><div className="d">Son 2 dakikada etkin</div></div>
        <div className="tile"><div className="l">Başarılı giriş · son {gun} gün</div><div className="v">{t.ok}</div><div className="d">{t.people} farklı kullanıcı</div></div>
        <div className="tile"><div className="l">Hatalı deneme</div><div className="v">{t.fail}</div>{t.fail > 0 && <div className="d down">Aşağıda “Hatalı” süzgecini seçin</div>}</div>
        <div className="tile"><div className="l">Toplam aktif süre</div><div className="v">{fmtDur(t.active)}</div><div className="d">Oturum başına ort. {fmtDur(t.avg)}</div></div>
      </div>

      {online.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Şu an çevrimiçi</h2>
          <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {online.map((o, i) => <span key={i} className="badge ok" title={o.path ?? ""}>● {o.name ?? o.u} · {o.path ? pageTitle(o.path) : "—"} · {fmtTime(o.at)}</span>)}
          </div>
        </div>
      )}

      <form className="card" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ flex: "1 1 200px" }}>Kullanıcı<input name="q" defaultValue={q} placeholder="Ad veya kullanıcı adı" /></label>
        <label>Dönem<select name="gun" defaultValue={String(gun)}><option value="1">Son 24 saat</option><option value="7">Son 7 gün</option><option value="30">Son 30 gün</option><option value="90">Son 90 gün</option></select></label>
        <label>Durum<select name="durum" defaultValue={durum}><option value="">Tümü</option><option value="basarili">Başarılı girişler</option><option value="acik">Açık oturumlar</option><option value="hatali">Hatalı denemeler</option></select></label>
        <button className="btn">Süz</button>{(q || durum || gun !== 7) && <Link className="btn secondary" href="/yonetim/oturumlar">Temizle</Link>}
      </form>

      {detail && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--orange)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{detail.name ?? detail.l.username} — oturum ayrıntısı</h2>
            <Link href={qs({ log: "" })} className="btn secondary sm">Kapat ✕</Link>
          </div>
          <p className="small">Giriş {fmtDT(detail.l.loginAt)} · {detail.l.logoutAt ? `çıkış ${fmtDT(detail.l.logoutAt)}` : `son hareket ${fmtDT(detail.l.lastSeenAt)}`} · oturum süresi {fmtDur(span(detail.l))} · aktif {fmtDur(detail.l.activeSeconds)} · {detail.l.pageViews} sayfa · {deviceLabel(detail.l.userAgent)} · IP {detail.l.ip ?? "—"}</p>
          {views.length === 0 ? <div className="empty">Bu oturumda sayfa kaydı yok.</div> : (
            <table><thead><tr><th>Saat</th><th>Ekran</th><th>Yol</th><th style={{ textAlign: "right" }}>Aktif süre</th></tr></thead><tbody>
              {views.map((v) => <tr key={v.id}><td className="small">{fmtTime(v.at)}</td><td>{pageTitle(v.path)}</td><td className="mono small muted">{v.path}</td><td style={{ textAlign: "right" }} className="small">{fmtDur(v.seconds)}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, overflowX: "auto" }}>
        <h2>Giriş kayıtları <span className="muted small">({total})</span></h2>
        {rows.length === 0 ? <div className="empty">Bu süzgeçle kayıt yok.</div> : (
          <table><thead><tr><th>Kullanıcı</th><th>Giriş</th><th>Çıkış / son hareket</th><th style={{ textAlign: "right" }}>Oturum süresi</th><th style={{ textAlign: "right" }}>Aktif</th><th style={{ textAlign: "right" }}>Sayfa</th><th>Son ekran</th><th>Cihaz · IP</th><th>Durum</th></tr></thead><tbody>
            {rows.map(({ l, name, roles }) => (
              <tr key={l.id} style={sp.log === l.id ? { background: "var(--surface-2, #f3f6fa)" } : undefined}>
                <td><b>{name ?? l.username}</b><div className="muted small">{l.username}{roles?.[0] ? ` · ${ROLE_LABELS[roles[0] as Role] ?? roles[0]}` : ""}</div></td>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{fmtDT(l.loginAt)}</td>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{l.success ? fmtDT(l.logoutAt ?? l.lastSeenAt) : "—"}</td>
                <td className="small" style={{ textAlign: "right" }}>{l.success ? fmtDur(span(l)) : "—"}</td>
                <td className="small" style={{ textAlign: "right" }}><b>{l.success ? fmtDur(l.activeSeconds) : "—"}</b></td>
                <td className="small" style={{ textAlign: "right" }}>{l.success ? (l.pageViews > 0 ? <Link href={qs({ log: l.id, s: String(page) })}>{l.pageViews} ›</Link> : 0) : "—"}</td>
                <td className="small">{l.lastPath ? pageTitle(l.lastPath) : "—"}</td>
                <td className="small muted">{deviceLabel(l.userAgent)}<div className="mono">{l.ip ?? "—"}</div></td>
                <td>{state(l)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
        {pages > 1 && <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>{page > 1 && <Link className="btn secondary sm" href={qs({ s: String(page - 1) })}>‹ Önceki</Link>}<span className="muted small">Sayfa {page} / {pages}</span>{page < pages && <Link className="btn secondary sm" href={qs({ s: String(page + 1) })}>Sonraki ›</Link>}</div>}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2>Kullanıcı bazında · son {gun} gün</h2>
        <table><thead><tr><th>Kullanıcı</th><th style={{ textAlign: "right" }}>Giriş</th><th style={{ textAlign: "right" }}>Hatalı</th><th style={{ textAlign: "right" }}>Toplam aktif süre</th><th style={{ textAlign: "right" }}>Sayfa</th><th>Son görülme</th></tr></thead><tbody>
          {perUser.map((p, i) => <tr key={i}><td><Link href={qs({ q: p.username, log: "" })}><b>{p.name ?? p.username}</b></Link><div className="muted small">{p.username}{!p.userId ? " · tanımsız kullanıcı adı" : ""}</div></td><td style={{ textAlign: "right" }}>{p.logins}</td><td style={{ textAlign: "right" }}>{p.fails ? <span style={{ color: "var(--bad)" }}>{p.fails}</span> : 0}</td><td style={{ textAlign: "right" }}><b>{fmtDur(p.active)}</b></td><td style={{ textAlign: "right" }}>{p.pages}</td><td className="small">{fmtDT(p.last)}</td></tr>)}
        </tbody></table>
        <p className="muted small">Oturum süresi giriş ile çıkış (veya son hareket) arasındaki süredir; aktif süre kullanıcının PILOTIS ekranına gerçekten baktığı süredir. 15 dakika hareket olmayan ve çıkış yapılmayan oturum “Ayrıldı” sayılır. Kayıtlar KVKK kapsamında güvenlik amacıyla tutulur.</p>
      </div>
    </>
  );
}
