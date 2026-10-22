import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { currentTemplates } from "@/lib/contracts";
import { ContractText } from "@/components/ContractText";
import { BRAND } from "@/data/catalog";
import { RegisterForm } from "./form";

export const metadata = { title: "Firma hesabı oluştur" };
export const dynamic = "force-dynamic";
export default async function Kayit() {
  if (await currentUser()) redirect("/portal");
  const tpls = await currentTemplates();
  const t = (c: string) => tpls.find((x) => x.code === c);
  const texts = ["KVKK_AYDINLATMA", "HIZMET_SOZLESMESI", "ODEME_TAAHHUDU"].map(t).filter(Boolean).map((x) => ({ code: x!.code, title: x!.title, node: <ContractText body={x!.body} /> }));
  return (
    <div className="auth auth-wide">
      <section className="auth-brand">
        <div className="auth-brand-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pilotis-logo-light.png" alt="PILOTIS" className="auth-logo" />
          <p className="auth-slogan">Müşteri ve acente hesabı</p>
          <ul className="auth-points">
            <li>Gemi bilgilerinizi girin, bedeli anında görün</li>
            <li>Talebinizi 7/24 portaldan gönderin (en az 6 saat önceden)</li>
            <li>Sözleşme, beyanname ve taahhütnameyi dijital onaylayın</li>
            <li>Taleplerinizin durumunu ve belgelerini tek yerden izleyin</li>
          </ul>
          <p className="auth-long">{BRAND.slogan}</p>
        </div>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <div><Link href="/giris" className="small">← Giriş ekranı</Link><h1 style={{ marginTop: 6 }}>Firma hesabı oluştur</h1>
            <p className="muted">Cari kaydınız hemen açılır ve talep oluşturabilirsiniz; vergi ve fatura bilgileriniz Yalova Pilotaj muhasebesi tarafından doğrulanır.</p></div>
          <RegisterForm texts={texts} />
        </div>
      </section>
    </div>
  );
}
