import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { BRAND, OPERATOR } from "@/data/catalog";
import { currentRole, ROLE_LABELS } from "@/lib/session";
import { setRole } from "./actions";

export const metadata: Metadata = {
  title: { default: "PILOTIS — Yalova Pilotaj", template: "%s · PILOTIS" },
  description: `${BRAND.long} — ${BRAND.slogan}`,
  icons: { icon: "/brand/pilotis-logo.png" },
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
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
            <Nav />
            <div className="client">
              İşletme
              <b>{OPERATOR.legalName}</b>
              {OPERATOR.phone} · {OPERATOR.email}
            </div>
          </aside>
          <div>
            <header className="topbar">
              <div className="slogan">{BRAND.slogan}</div>
              <form action={setRole}>
                <span title="Geliştirme oturumu: gerçek kimlik doğrulama ve MFA canlıya geçişten önce eklenecek">Rol (geliştirme):</span>
                <select name="role" defaultValue={role} style={{ width: 220 }}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="btn secondary" type="submit">Uygula</button>
              </form>
            </header>
            <main className="main">
              {children}
              <div className="footer">
                <span><b>PILOTIS</b> v0.1 · Faz 0–1 · {BRAND.slogan}</span>
                <span>Zamanlar Europe/Istanbul gösterilir, UTC saklanır.</span>
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
