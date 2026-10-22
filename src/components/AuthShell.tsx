import Link from "next/link";
import { BRAND } from "@/data/catalog";

export function AuthShell({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-brand"><div className="auth-brand-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/pilotis-logo-light.png" alt="PILOTIS" className="auth-logo" />
        <p className="auth-slogan">{BRAND.slogan}</p>
      </div></section>
      <section className="auth-form"><div className="auth-card">
        <div><Link href="/giris" className="small">← Giriş ekranı</Link><h1 style={{ marginTop: 6 }}>{title}</h1><p className="muted">{lead}</p></div>
        {children}
      </div></section>
    </div>
  );
}
