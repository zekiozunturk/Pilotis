import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { BRAND, OPERATOR } from "@/data/catalog";
import { currentUser, ROLE_LABELS } from "@/lib/session";
import { homeFor } from "./actions";
import { LoginForm } from "./form";
import type { Role } from "@/lib/workflow";

export const metadata = { title: "Giriş" };
export const dynamic = "force-dynamic";
const DESC: Partial<Record<Role, string>> = {
  SYSTEM_ADMIN: "Kullanıcılar, roller, yedek ve sistem ayarları",
  BUSINESS_MANAGER: "Kokpit, performans analizi, onaylar",
  OPERATIONS_MANAGER: "Talep onayı, planlama, iş emirleri",
  PILOT: "Görevlerim, iş başlat/bitir, dinlenme durumu",
  TUG_MASTER: "Römorkör görevleri, ekip ve saatler",
  SHORE_OPS: "Kıyı operasyon, gemi ve belge kontrolü",
  CUSTOMER: "Talep oluştur, fiyat gör, belgeleri onayla",
  ACCOUNTING: "Tahakkuk, fatura, tahsilat, kur",
};

export default async function Giris({ searchParams }: { searchParams: Promise<{ sonra?: string; cikis?: string; kayit?: string }> }) {
  const u = await currentUser();
  const sp = await searchParams;
  if (u) redirect(await homeFor(u.roles as Role[]));
  const demo = process.env.DEMO_LOGINS !== "0" ? await db.select({ username: s.users.username, name: s.users.name, roles: s.users.roles }).from(s.users).where(eq(s.users.isDemo, true)).orderBy(asc(s.users.createdAt)) : [];
  const ORDER = ["admin", "yonetici", "kaptan", "romorkor", "kiyi", "musteri", "muhasebe"];
  demo.sort((a, b) => (ORDER.indexOf(a.username ?? "") + 100) % 100 - (ORDER.indexOf(b.username ?? "") + 100) % 100);
  return (
    <div className="auth">
      <section className="auth-brand" aria-hidden="false">
        <div className="auth-brand-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pilotis-logo-light.png" alt="PILOTIS" className="auth-logo" />
          <p className="auth-slogan">{BRAND.slogan}</p>
          <p className="auth-long">{BRAND.long}</p>
          <ul className="auth-points">
            <li>Talep → planlama → operasyon → tahakkuk tek kayıt üzerinde</li>
            <li>Tarife sürümüne bağlı otomatik fiyat; faturalar TL kesilir</li>
            <li>Dijital sözleşme, beyan ve taahhüt onayı</li>
          </ul>
          <div className="auth-op">{OPERATOR.legalName}<br />{OPERATOR.phone} · {OPERATOR.email}</div>
        </div>
        <svg className="auth-waves" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden><path d="M0 60 Q 75 20 150 60 T 300 60 T 450 60 T 600 60 V120 H0Z" /><path d="M0 80 Q 75 45 150 80 T 300 80 T 450 80 T 600 80 V120 H0Z" /></svg>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <h1>Giriş yap</h1>
          <p className="muted">Yalova Pilotaj personeli ve müşteri hesapları aynı ekrandan girer; ekranınız rolünüze göre açılır.</p>
          {sp.cikis && <div className="alert ok" role="status"><span>✓</span><div>Oturum kapatıldı.</div></div>}
          {sp.kayit && <div className="alert ok" role="status"><span>✓</span><div><b>Hesabınız oluşturuldu</b>Kullanıcı adınız ve şifrenizle giriş yapabilirsiniz.</div></div>}
          <LoginForm next={sp.sonra ?? ""} demo={demo.map((d) => ({ username: d.username ?? "", name: d.name, role: ROLE_LABELS[(d.roles as Role[])[0]], desc: DESC[(d.roles as Role[])[0]] ?? "" }))} />
          <div className="auth-foot">
            <span>Müşteri veya acente misiniz?</span> <Link href="/kayit" className="btn secondary">Firma hesabı oluştur</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
