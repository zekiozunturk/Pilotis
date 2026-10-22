import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { BRAND, OPERATOR } from "@/data/catalog";
import { currentScope, ROLE_LABELS } from "@/lib/session";
import { db, schema as s } from "@/db";
import { asc, eq } from "drizzle-orm";
import { setRole, setDisplayCurrency } from "./actions";
import { getDisplay } from "@/lib/display";

export const metadata: Metadata = {
  title: { default: "PILOTIS — Yalova Pilotaj", template: "%s · PILOTIS" },
  description: `${BRAND.long} — ${BRAND.slogan}`,
  icons: { icon: "/brand/pilotis-logo.png" },
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { role, external, partyId } = await currentScope();
  const display = await getDisplay();
  const companies = await db.select({ id: s.parties.id, name: s.parties.legalName }).from(s.parties).where(eq(s.parties.kind, "COMPANY")).orderBy(asc(s.parties.legalName));
  return (
    <html lang="tr">
      <body>
        <div className="shell">
          <aside className="side">
            <div className="brand">
              <div style={{ background: "#fff", borderRadius: 8, padding: "8px 10px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/pilotis-logo.png" alt="PILOTIS" style={{ width: "100%", display: "block" }} />
              </div>
            </div>
            <Nav external={external} />
            <div className="client">
              İşletme
              <b>{OPERATOR.legalName}</b>
              {OPERATOR.phone} · {OPERATOR.email}
            </div>
          </aside>
          <div>
            <header className="topbar">
              <div className="slogan">{BRAND.slogan}</div>
              <form action={setDisplayCurrency} style={{ marginLeft: "auto" }}>
                <span title="Hesap ve faturalar TL'dir; döviz gösterimi güncel TCMB kuruyla bilgi amaçlıdır">Gösterim:</span>
                {(["TRY", "USD", "EUR"] as const).map((c) => <button key={c} name="ccy" value={c} className={`btn ${display.ccy === c ? "" : "secondary"}`} style={{ minHeight: 30, padding: "4px 10px" }}>{c === "TRY" ? "₺ TL" : c === "USD" ? "$ USD" : "€ EUR"}</button>)}
              </form>
              <form action={setRole}>
                <span title="Geliştirme oturumu: gerçek kimlik doğrulama ve MFA canlıya geçişten önce eklenecek">Rol (geliştirme):</span>
                <select name="role" defaultValue={role} style={{ width: 220 }}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select name="party" defaultValue={partyId ?? ""} style={{ width: 210 }} title="Müşteri / fatura muhatabı rolleri için firma">
                  <option value="">Firma (dış roller için)</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn secondary" type="submit">Uygula</button>
              </form>
            </header>
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
