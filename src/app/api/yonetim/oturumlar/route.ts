/** Oturum kayıtlarını CSV (Excel uyumlu, ; ayraçlı, UTF-8 BOM) olarak indir — yalnız sistem yöneticisi */
import { and, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentUser } from "@/lib/session";
import { deviceLabel, END_LABEL, FAIL_LABEL } from "@/lib/session-log";
import { pageTitle } from "@/data/yunus";

const f = (d: Date | null) => (d ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "medium" }).format(d) : "");
const c = (v: unknown) => { const x = String(v ?? ""); return /[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u?.roles.includes("SYSTEM_ADMIN")) return new Response("Yetkisiz", { status: 404 });
  const p = new URL(req.url).searchParams;
  const gun = ["1", "7", "30", "90"].includes(p.get("gun") ?? "") ? Number(p.get("gun")) : 7;
  const q = (p.get("q") ?? "").trim(), durum = p.get("durum") ?? "";
  const conds: SQL[] = [gte(s.sessionLogs.loginAt, new Date(Date.now() - gun * 864e5))];
  if (q) conds.push(or(ilike(s.sessionLogs.username, `%${q}%`), ilike(s.users.name, `%${q}%`))!);
  if (durum === "hatali") conds.push(eq(s.sessionLogs.success, false));
  if (durum === "basarili" || durum === "acik") conds.push(eq(s.sessionLogs.success, true));
  if (durum === "acik") conds.push(sql`${s.sessionLogs.logoutAt} is null`);
  const rows = await db.select({ l: s.sessionLogs, name: s.users.name }).from(s.sessionLogs).leftJoin(s.users, eq(s.users.id, s.sessionLogs.userId)).where(and(...conds)).orderBy(desc(s.sessionLogs.loginAt)).limit(20000);
  const head = ["Kullanıcı", "Kullanıcı adı", "Sonuç", "Giriş", "Çıkış", "Son hareket", "Oturum süresi (dk)", "Aktif süre (dk)", "Sayfa sayısı", "Son ekran", "Bitiş nedeni", "Cihaz", "IP"];
  const lines = rows.map(({ l, name }) => [name ?? "", l.username, l.success ? "Başarılı" : `Hatalı: ${FAIL_LABEL[l.failReason ?? ""] ?? l.failReason}`, f(l.loginAt), f(l.logoutAt), l.success ? f(l.lastSeenAt) : "",
    l.success ? (((l.logoutAt ?? l.lastSeenAt).getTime() - l.loginAt.getTime()) / 60000).toFixed(1).replace(".", ",") : "", l.success ? (l.activeSeconds / 60).toFixed(1).replace(".", ",") : "", l.pageViews, l.lastPath ? pageTitle(l.lastPath) : "", END_LABEL[l.endReason ?? ""] ?? "", deviceLabel(l.userAgent), l.ip ?? ""].map(c).join(";"));
  const body = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pilotis-oturum-kayitlari-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
