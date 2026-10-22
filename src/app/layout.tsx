import "./globals.css";
import "./themes.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { BRAND, OPERATOR } from "@/data/catalog";
import { currentScope, currentUser, ROLE_LABELS } from "@/lib/session";
import { logout } from "./giris/actions";
import { db, schema as s } from "@/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRole, setDisplayCurrency } from "./actions";
import { getDisplay } from "@/lib/display";
import { getUiState } from "@/lib/ui-prefs-server";
import { htmlAttrs, DEVICE_SCRIPT, THEMES } from "@/lib/ui-prefs";
import { ThemeQuick } from "@/components/ThemeQuick";
import { MenuToggle } from "@/components/MenuToggle";
import { CommandPalette, TopTools } from "@/components/CommandPalette";

export const metadata: Metadata = {
  title: { default: "PILOTIS — Yalova Pilotaj", template: "%s · PILOTIS" },
  description: `${BRAND.long} — ${BRAND.slogan}`,
  icons: { icon: "/brand/pilotis-logo.png" },
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ui = await getUiState();
  const { attrs, style } = htmlAttrs(ui.prefs);
  const user = await currentUser();
  if (!user) {
    // giriş / kayıt ekranları: kabuk (menü, üst çubuk) olmadan
    return (
      <html lang="tr" {...attrs} data-locked={JSON.stringify(ui.policy.locked)} data-modes={JSON.stringify(THEMES.find((t) => t.id === ui.prefs.theme)?.modes ?? ["light"])} style={style as React.CSSProperties} suppressHydrationWarning>
        <head><script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT }} /></head>
        <body>{children}</body>
      </html>
    );
  }
  // Geçici şifreyle giren kullanıcı, şifresini değiştirmeden başka sayfaya geçemez
  if (user.mustChangePassword) { const path = (await headers()).get("x-pathname") ?? ""; if (!path.startsWith("/hesabim")) redirect("/hesabim?zorunlu=1"); }
  const { role, external, partyId } = await currentScope();
  const display = await getDisplay();
  const isAdmin = user.roles.includes("SYSTEM_ADMIN");
  const [{ unread }] = await db.select({ unread: sql<number>`count(*)::int` }).from(s.notifications).where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt)));
  const party = user.partyId ? (await db.select({ n: s.parties.legalName }).from(s.parties).where(eq(s.parties.id, user.partyId)))[0]?.n : null;
  const companies = await db.select({ id: s.parties.id, name: s.parties.legalName }).from(s.parties).where(eq(s.parties.kind, "COMPANY")).orderBy(asc(s.parties.legalName));
  return (
    <html lang="tr" {...attrs} data-locked={JSON.stringify(ui.policy.locked)} data-modes={JSON.stringify(THEMES.find((t) => t.id === ui.prefs.theme)?.modes ?? ["light"])} style={style as React.CSSProperties} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT }} /></head>
      <body>
        <div className="shell">
          <aside className="side">
            <div className="brand">
              <div style={{ background: "var(--logo-bg)", borderRadius: 8, padding: "8px 10px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/pilotis-logo.png" alt="PILOTIS" style={{ width: "100%", display: "block" }} />
              </div>
              <MenuToggle />
            </div>
            <Nav external={external} role={role} />
            <div className="client">
              İşletme
              <b>{OPERATOR.legalName}</b>
              {OPERATOR.phone} · {OPERATOR.email}
            </div>
          </aside>
          <div>
            <header className="topbar">
              <div className="slogan">{BRAND.slogan}</div>
              {!external && <TopTools role={role} />}
              <ThemeQuick prefs={ui.prefs} personal={ui.personal} locked={ui.policy.locked} />
              <div className="ccy" style={{ marginLeft: "auto" }} role="group" aria-label="Gösterim para birimi">
                <span title="Hesap ve faturalar TL'dir; döviz gösterimi güncel TCMB kuruyla bilgi amaçlıdır">Gösterim:</span>
                {(["TRY", "USD", "EUR"] as const).map((c) => (
                  <form key={c} action={setDisplayCurrency}><input type="hidden" name="ccy" value={c} /><button aria-pressed={display.ccy === c} className={`btn ${display.ccy === c ? "" : "secondary"}`} style={{ minHeight: 30, padding: "4px 10px" }}>{c === "TRY" ? "₺ TL" : c === "USD" ? "$ USD" : "€ EUR"}</button></form>
                ))}
              </div>
              {isAdmin && (
                <form action={setRole} className="preview">
                  <span title="Sistem yöneticisi, sunum ve destek için başka bir rolün ekranını önizleyebilir. İşlemler yöneticinin adıyla kaydedilir.">Rol önizleme:</span>
                  <select name="role" defaultValue={role} style={{ width: 200 }} aria-label="Önizlenecek rol">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select name="party" defaultValue={partyId ?? ""} style={{ width: 190 }} title="Müşteri / fatura muhatabı rolleri için firma" aria-label="Önizlenecek firma">
                    <option value="">Firma (dış roller için)</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button className="btn secondary" type="submit">Uygula</button>
                </form>
              )}
              <div className="userbox">
                <Link href="/bildirimler" className="bell" aria-label={`Bildirimler${unread ? `, ${unread} okunmamış` : ""}`} title="Bildirimler"><span aria-hidden>🔔</span>{unread > 0 && <span className="n">{unread > 99 ? "99+" : unread}</span>}</Link>
                <span className="avatar" aria-hidden>{user.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                <span className="who"><b>{user.name}</b><span>{ROLE_LABELS[role]}{role !== user.roles[0] && isAdmin ? " (önizleme)" : ""}{party ? ` · ${party}` : ""}</span></span>
                <form action={logout}><button className="btn secondary" type="submit">Çıkış</button></form>
              </div>
            </header>
            {!external && <CommandPalette role={role} />}
            <main className="main">
              {children}
              <div className="footer">
                <span><b>PILOTIS</b> v0.4 · Faz 3 + TL/fiyat listesi · {BRAND.slogan}</span>
                <span>Zamanlar Europe/Istanbul gösterilir, UTC saklanır.</span>
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
